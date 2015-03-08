/*
 * The data model / logic for the ferry routes.
 * This model follows the original code (for the windows
 * phone) fairly closely.  Rather than reproduce that
 * documentation, here I'm only going to focus on what
 * is different:
 *
 * The original NextFerry client application had
 * explicit classes (Schedule, DepartureTime, etc.)
 * that have been removed from this version.
 * (They were present to support databinding, which
 * I am not using nearly as much in this version of
 * the app.)
 * So in this app, times are just ints, and sequences
 * of times are just arrays, and ordinary javascript
 * objects replace Schedules.  Behavior is defined
 * at the Route level, or the module level, instead.
 *
 * I've made the object classes (Route, Terminal, Alert) into managers
 * for the corresponding sets as well.  (class methods vs. instance
 * methods.)
 *
 * Also, the overall application has been split between the
 * route / schedule logic (in this file) and the
 * application / rendering / interaction logic
 * (app.js), which is different from how the older
 * codebase is factored.
 */
var NextFerry = (function ($) {
    "use strict";

    // NFTime submodule (not object type)
    // Times are minutes past midnight, but with the day boundary at 2:30am,
    // to match WSDOT schedule behavior.
    var NFTime = function() {
        var _cache12 = {};
        var _cache24 = {};
        var Noon = 12 * 60;
        var Midnight = 24 * 60;
        var MorningCutoff = 150; // 2:30am
        var ismock = false;
        var hours, minutes, dow;

        // Use mockOn to set specific times for testing, and mockOff to return
        // to normal behavior.
        // The arguments are *calendar* (uncorrected) hour, minute, day-of-week
        var mockOn = function(h,m,d) {
            ismock = true;
            _tsched = false;
            hours = h;
            minutes = m;
            dow = d;
        };
        var mockOff = function() {
            ismock = false;
            _tsched = false;
        };
        var now = function() {
            if ( !ismock ) {
                var nowD = new Date(Date.now());
                hours = nowD.getHours();
                minutes = nowD.getMinutes();
            }

            var nowT = hours * 60 + minutes;
            return ( nowT < MorningCutoff ? nowT + Midnight : nowT);
        };
        var dayOfWeek = function() {
            if ( !ismock ) {
                var nowD = new Date(Date.now());
                dow = nowD.getDay();
            }
            return ( now() > Midnight ? dow-1 : dow );
        };

        // Create printable strings for times, faster
        // than converting them to date objects.  And cache them.
        var display12 = function(t) {
            if (!_cache12[t]) {
                var hours = Math.floor(t / 60);
                var minutes = t % 60;
                if (hours > 24)
                    hours -= 24;
                if (hours > 12)
                    hours -= 12;
                if (hours === 0)
                    hours = 12;
                _cache12[t] = hours + ":" + (minutes < 10 ? "0" : "") + minutes;
            }
            return _cache12[t];
        };
        var display24 = function(t) {
            if (!_cache24[t]) {
                var hours = Math.floor(t / 60);
                var minutes = t % 60;
                if (hours >= 24)
                    hours -= 24;
                _cache24[t] =
                    (hours < 10 ? "0" : "") + hours +
                    ":" +
                    (minutes < 10 ? "0" : "") + minutes;
            }
            return _cache24[t];
        };
        var _display = display12;
        var display = function(t) { return _display(t); }
        var setDisplayFormat = function(tf) {
            _display = (tf === "tf12" ? display12 : display24);
        };

        var toDate = function(t) {
            // given one of our times, return the corresponding Date object
            // for that time today.
            // Complicated by having to check both t and now to determine what
            // the correct date should be.  I apologize to anyone who has to read this.
            // CAVEAT: this doesn't handle the "reverse wraparound" (it is now
            // early morning and the argument t is from yesterday), but that
            // case doesn't arise in our usage, so we don't bother.
            var dt = new Date(Date.now());
            if ( t > 24 * 60 )  {
                if ( now() < 24 * 60 ) {
                    // correct the date only when we should.
                    dt.setDate( dt.getDate() + 1 );
                }
                t -= ( 24 * 60 );
            }
            dt.setHours( Math.floor(t / 60), t % 60, 0, 0 );
            return dt;
        };

        var submodule = {
            Noon : Noon,
            Midnight : Midnight,
            MorningCutoff : MorningCutoff,
            now : now,
            toDate : toDate,
            dayOfWeek : dayOfWeek,
            mockOn : mockOn,
            mockOff : mockOff,
            display : display,
            setDisplayFormat : setDisplayFormat
        };

        return submodule;
    }(); // submodule NFTime


    var todaysScheduleType = function() {
        if (!_tsched) {
            var dow = NFTime.dayOfWeek();
            _tsched = (dow < 1 || dow > 5) ? "weekend" : "weekday";
        }
        return _tsched;
    };
    var _tsched = null;


    var _allRoutes = [];    // main data structure: list of all routes
    var _displayList = {};  // user-chosen *set* of routes to display (route id's are keys)
    var _alertList = [];    // list of all alerts (not persisted)
    var _readList = [];     // list of alerts the user has already read
    var _buffertime;

    var init = function() {
        _allRoutes = [  // routes are "schedule-less" until main app init.
            new Route(1, 7, 3, "bainbridge", "bainbridge"),
            new Route(1 << 2, 8, 12, "edmonds", "kingston"),
            new Route(1 << 3, 14, 5, "mukilteo", "clinton"),
            new Route(1 << 4, 11, 17, "pt townsend", "pt townsend"),
            new Route(1 << 5, 9, 20, "fauntleroy-southworth", "southworth-fauntleroy"),
            new Route(1 << 6, 9, 22, "fauntleroy-vashon", "vashon-fauntleroy"),
            new Route(1 << 7, 22, 20, "vashon-southworth", "southworth-vashon"),
            new Route(1 << 8, 7, 4, "bremerton", "bremerton"),
            new Route(1 << 9, 16, 21, "pt defiance-vashon", "vashon-pt defiance"),
            new Route(1 << 10, 1, 10, "friday harbor", "friday harbor"),
            new Route(1 << 11, 1, 15, "orcas", "orcas")
        ];

        // initialize localStorage if necessary
        if ( ! ("tf" in window.localStorage)) window.localStorage["tf"] = "tf12";
        if ( ! ("bt" in window.localStorage)) window.localStorage["bt"] = "15";
        if ( ! ("rl" in window.localStorage)) window.localStorage["rl"] = "[]";
        if ( ! ("useloc" in window.localStorage)) window.localStorage["useloc"] = "false";

        if ( window.localStorage["dl"] ) {
            _displayList = JSON.parse( window.localStorage["dl"] );
        }
        else {
            // default: display all routes
            _displayList = {};
            for( var i in _allRoutes ) {
                _displayList[_allRoutes[i].code] = true;
            }
            window.localStorage["dl"] = JSON.stringify( _displayList );
        }

        NFTime.setDisplayFormat( window.localStorage["tf"] );
        _readList = JSON.parse( window.localStorage["rl"] );
        _buffertime = parseInt( window.localStorage["bt"] );
    };

    var reset = function() {
        delete( window.localStorage["cache"] );
        delete( window.localStorage["cachedate"] );
        delete( window.localStorage["schedulename"] );
        delete( window.localStorage["rl"] );
        Terminal.clearTTs();
        _allRoutes = [];
        _displayList = {};
        _alertList = [];
        _readList = [];
        init();
    };

    var synchSettings = function() {
        // OK, this looks weird, but here's what's happening:
        // for displaylist and readlist the "master copy" is in memory
        // (_displayList and _readList),
        // while for buffertime, the master copy is the one in localStorage.
        // either way, this makes sure the master's value is propagated.
        window.localStorage["dl"] = JSON.stringify( _displayList );
        window.localStorage["rl"] = JSON.stringify( _readList );
        _buffertime = parseInt( window.localStorage["bt"] );
    };


    function Route(code, eastCode, westCode, westName, eastName) {
        this.code = code;
        this.terminals = {
            "west" : westCode,
            "east" : eastCode
        };
        this.displayName = {
            "west" : westName,
            "east" : eastName
        };
        // times are dictionaries several levels deep
        // this.times["east|west"]["weekday|weekend|special"]
        this.times = {
            "west" : {},
            "east" : {}
        };
    }
    Route.allRoutes = function() {
        return _allRoutes;
    };
    Route.displayRoutes = function() {
        var result = [];
        for (var i in _displayList) {
            result.push(Route.find(i));
        }
        return result;
    };
    Route.prototype.isDisplayed = function() {
        return this.code in _displayList;
    };
    Route.prototype.display = function(b) {
        if (b) {
            _displayList[this.code] = true;
        }
        else {
            delete _displayList[this.code];
        }
    };
    Route.find = function(name) {
        for (var i in _allRoutes) {
            var r = _allRoutes[i];
            if (r.displayName.west === name ||
                r.displayName.east === name ||
                r.code == name ) {
                return r;
            }
        }
    };
    Route.clearAllTimes = function() {
        for (var i in _allRoutes) {
            var r = _allRoutes[i]
            r.times.west = {};
            r.times.east = {};
        }
    };
    // Syntax of line is <routename>,<code>,<time1>,<time2>,....
    Route.loadTimes = function(line) {
        var tokens = line.split(",");
        var rte = Route.find(tokens.shift());
        var key = tokens.shift();
        var dir = (key[0] === "w" ? "west" : "east");
        var schedtype = "weekday";
        if (key[1] === "e") {
            schedtype = "weekend";
        }
        if (key[1] === "s") {
            schedtype = "special";
        }
        rte.times[dir][schedtype] = tokens.map(function(v) {
            return parseInt(v);
        });
    };

    Route.prototype.todaysSchedule = function() {
        // Use special if we have it, else default
        return this.times.west.special ? "special" : todaysScheduleType();
    };
    // times the ferry departs after now, today
    Route.prototype.futureDepartures = function(dir, sched) {
        sched = sched || this.todaysSchedule();
        var lst = this.times[dir][sched];
        var t = NFTime.now();
        return (lst ? lst.filter(function(e, i) {
            return (e > t);
        }) : []);
    };
    Route.prototype.beforeNoon = function(dir, sched) {
        sched = sched || this.todaysSchedule();
        var lst = this.times[dir][sched];
        return (lst ? lst.filter(function(e, i) {
            return (e < NFTime.Noon);
        }) : []);
    };
    Route.prototype.afterNoon = function(dir, sched) {
        sched = sched || this.todaysSchedule();
        var lst = this.times[dir][sched];
        return (lst ? lst.filter(function(e, i) {
            return (e >= NFTime.Noon);
        }) : []);
    };
    // traveling east, you are going *to* the east terminal
    // and coming *from* the west terminal, and vice versa.
    Route.prototype.termTo = function(dir) {
        return _allTerminals[this.terminals[dir]];
    };
    Route.prototype.termFrom = function(dir) {
        return _allTerminals[this.terminals[dir === "west" ? "east" : "west"]];
    };
    Route.prototype.hasAlerts = function() {
        // returns one of false 'alerts_read' 'alerts_unread'
        return Alert.hasAlerts(this);
    };
    Route.prototype.markAlerts = function() {
        var alerts = Alert.alertsFor(this);
        for( var i in alerts ) {
            alerts[i].markRead();
        }
    };
    Route.prototype.tGoodness = function(dir,departuretime,now) {
        now = now || NFTime.now();
        return this.termFrom(dir).tGoodness(departuretime - now);
    };


    var _lastLoadTime;
    var _oldTTThreshold = 1000 * 60 * 5;
    function Terminal(c, n) {
        this.code = c;
        this.name = n;
        this.tt = false;
    }
    Terminal.clearTTs = function() {
        for (var t in _allTerminals) {
            _allTerminals[t].tt = false;
        }
        _lastLoadTime = undefined;
    };
    Terminal.clearOldTTs = function() {
        if ( _lastLoadTime && (_lastLoadTime - Date.now()) > _oldTTThreshold ) {
            clearTTs();
        }
    };
    Terminal.hasTTs = function() {
        return (_lastLoadTime != undefined);
    }
    Terminal.loadTTs = function(text) {
        Terminal.clearTTs();
        var lines = text.split("\n");
        for (var i in lines) {
            var pieces = lines[i].split(":");
            if ( pieces.length === 2 ) {
                _allTerminals[pieces[0]].tt = parseInt(pieces[1]);
            }
        }
        _lastLoadTime = Date.now();
    };
    Terminal.allTerminals = function() {
        return _allTerminals;
    };
    Terminal.find = function(code) {
        return _allTerminals[code];
    };

    Terminal.prototype.tGoodness = function(delta) {
        // Is delta enough time to get to the terminal, given current travel time
        // and leaving enough buffer time (as determined by the user) to spare?
        // Returns one of:
        //  "TooLate":  no, not at all
        //  "Risky" : less than buffer time is left
        //  "Good" : yes, perfect timing
        //  "Indifferent" : time is more than 2h from now, so we don't care, or
        //  "Unknown" : we can't estimate, because we don't know the travel time.
        if (this.tt === false) // ! not just falsey
            return "Unknown";
        else if ( delta < this.tt * 0.9 )  // fudge factor.
            return "TooLate";
        else if ( delta < this.tt + _buffertime )
            return "Risky";
        else if ( delta > this.tt + _buffertime + 120 )
            return "Indifferent";
        else
            return "Good";
    };
    var _allTerminals = {
        1 : new Terminal(1, "Anacortes"),
        3 : new Terminal(3, "Bainbridge Island"),
        4 : new Terminal(4, "Bremerton"),
        5 : new Terminal(5, "Clinton"),
        8 : new Terminal(8, "Edmonds"),
        9 : new Terminal(9, "Fauntleroy"),
        10 : new Terminal(10, "Friday Harbor"),
        11 : new Terminal(11, "Coupeville"),
        12 : new Terminal(12, "Kingston"),
        13 : new Terminal(13, "Lopez Island"),
        14 : new Terminal(14, "Mukilteo"),
        15 : new Terminal(15, "Orcas Island"),
        16 : new Terminal(16, "Point Defiance"),
        17 : new Terminal(17, "Port Townsend"),
        7 : new Terminal(7, "Seattle"),
        18 : new Terminal(18, "Shaw Island"),
        20 : new Terminal(20, "Southworth"),
        21 : new Terminal(21, "Tahlequah"),
        22 : new Terminal(22, "Vashon Island")
    };


    function Alert(id, codes, body) {
        this.id = id;
        this.codes = codes;
        this.body = body;
        this.unread = true;
    }
    Alert.prototype.markRead = function() {
        this.unread = false;
        _readList.push(this.id);
    };
    Alert.prototype.posted = function() {
        return this.id.substring(0,5); // the hack lives on...
    };
    Alert.allAlerts = function() {
        return _alertList;
    };
    Alert.alertsFor = function(r) {
        var results = [];
        if ( typeof r === "string" ) {
            r = Route.find(r);
        }
        for (var i in _alertList) {
            var a = _alertList[i];
            if (a.codes & r.code) {
                results.push(a);
            }
        }
        return results.sort( function(a,b) {
            // reverse sort on id
            return ( a.id < b.id ? 1 : (a.id > b.id ? -1 : 0 ));
        });
    };
    Alert.hasAlerts = function (r) {
        var found = false;
        if ( typeof r === "string" ) {
            r = Route.find(r);
        }
        for (var i in _alertList) {
            var a = _alertList[i];
            if (a.codes & r.code) {
                if (a.unread)
                    return 'alerts_unread';
                else
                    found = true;
            }
        }
        return found? 'alerts_read' : false;
    };
    Alert.loadAlerts = function(text) {
        _alertList = [];
        var alertblocks = text.split(/^__/m);
        var i;
        for (i in alertblocks) {
            if (alertblocks[i].length > 2) { // skip extraneous newlines
                var k = alertblocks[i].indexOf("\n");
                var header = alertblocks[i].substr(0,k);  // substr and substring?
                var body = alertblocks[i].substring(k+1); // js at its finest! (not!)
                var ary, id, codes;

                ary = header.split(" ");
                id = ary[1];
                codes = ary[2];
                _alertList.push(new Alert(id, codes, body));
                mylog("Alert for " + codes);
            }
        }
        var oldreadlist = _readList;
        _readList = [];
        for (i in oldreadlist) {
            for (var j in _alertList) {
                if (oldreadlist[i] === _alertList[j].id) {
                    _alertList[j].unread = false;
                    _readList.push(oldreadlist[i]);
                    break;
                }
            }
        }
    };

    var module = {
        init : init,
        reset : reset,
        synchSettings : synchSettings,
        NFTime : NFTime,
        Route : Route,
        Terminal : Terminal,
        Alert : Alert,
        // for testing
        todaysScheduleType : todaysScheduleType
    };

    return module;
}(jQuery));
