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

    // NFTime submodule (not object type)
    // Times are minutes past midnight, but with the day boundary at 2:30am,
    // to match WSDOT schedule behavior.
    var NFTime = function() {
        var _cache12 = {};
        var _cache24 = {};
        var Noon = 12 * 60;
        var Midnight = 24 * 60;
        var MorningCutoff = 150; // 2:30am
        var isSpoof = false;
        var hours, minutes, dow;

        // Use spoofOn to set specific times for testing, and spoofOff to return
        // to normal behavior.
        // The arguments are *calendar* (uncorrected) hour, minute, day-of-week
        var spoofOn = function(h,m,d) {
            isSpoof = true;
            _tsched = false;
            hours = h;
            minutes = m;
            dow = d;
        };
        var spoofOff = function() {
            isSpoof = false;
            _tsched = false;
        };
        var now = function() {
            if ( !isSpoof ) {
                var nowD = new Date(Date.now());
                hours = nowD.getHours();
                minutes = nowD.getMinutes();
            }

            var nowT = hours * 60 + minutes;
            return ( nowT < MorningCutoff ? nowT + Midnight : nowT);
        };
        var dayOfWeek = function() {
            if ( !isSpoof ) {
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

        var submodule = {
            Noon : Noon,
            Midnight : Midnight,
            MorningCutoff : MorningCutoff,
            now : now,
            dayOfWeek : dayOfWeek,
            spoofOn : spoofOn,
            spoofOff : spoofOff,
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
    }
    var _tsched = null;


    var _allRoutes = [];    // main data structure: list of all routes
    var _displayList = {};  // user-chosen *set* of routes to display (route id's are keys)
    var _alertList = [];    // list of all alerts (not persisted)
    var _readList = [];     // list of alerts the user has already read
    var _buffertime;

    var init = function() {
        _allRoutes = [  // routes are "schedule-less" until main app init.
            new Route(1, 7, 3, "bainbridge", "bainbridge"),
            new Route(1 << 2, 8, 12, "edmonds", "edmonds"),
            new Route(1 << 3, 14, 5, "mukilteo", "mukilteo"),
            new Route(1 << 4, 11, 17, "pt townsend", "pt townsend"),
            new Route(1 << 5, 9, 20, "fauntleroy-southworth", "southworth-fauntleroy"),
            new Route(1 << 6, 9, 22, "fauntleroy-vashon", "vashon-fauntleroy"),
            new Route(1 << 7, 22, 20, "vashon-southworth", "southworth-vashon"),
            new Route(1 << 8, 7, 4, "bremerton", "bremerton"),
            new Route(1 << 9, 21, 16, "vashon-pt defiance", "pt defiance-vashon"),
            new Route(1 << 10, 1, 10, "friday harbor", "friday harbor"),
            new Route(1 << 11, 1, 15, "orcas", "orcas")
        ];

        // initialize LS if necessary
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

    var synchSettings = function() {
        // OK, this looks weird, but here's what's happening:
        // for displaylist, the "master copy" is in memory (_displayList),
        // while for buffertime, the master copy is the one in localStorage.
        // either way, this makes sure the master's value is propagated.
        window.localStorage["dl"] = JSON.stringify( _displayList );
        _buffertime = parseInt( window.localStorage["bt"] );
    };


    function Route(code, eastCode, westCode, westName, eastName) {
        this.code = code;
        this.terminals = {
            "west" : westCode,
            "east" : eastCode
        };
        this.displayName = {	// subtlety: a westbound route goes from east terminal to west terminal
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
    }
    Route.displayRoutes = function() {
        var result = [];
        for (var i in _displayList) {
            result.push(Route.find(i));
        }
        return result;
    }
    Route.prototype.isDisplayed = function() {
        return this.code in _displayList;
    }
    Route.prototype.display = function(b) {
        // TODO: what is the real syntax?
        if (b) {
            _displayList[this.code] = true;
        }
        else {
            delete _displayList[this.code];
        }
    }
    Route.find = function(name) {
        for (var i in _allRoutes) {
            var r = _allRoutes[i];
            if (r.displayName.west === name ||
                r.displayName.east === name ||
                r.code == name ) {
                return r;
            }
        }
    }
    Route.clearAllTimes = function() {
        for (var i in _allRoutes) {
            var r = _allRoutes[i]
            r.times.west = {};
            r.times.east = {};
        }
    }
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
    Route.prototype.termName = function(dir) {
        return _allTerminals[this.terminals[dir]].name;
    }
    Route.prototype.hasNewAlerts = function() {
		return Alert.hasAlerts(this,true);
    };
    Route.prototype.tGoodness = function(dir,departuretime,now) {
        now = now || NFTime.now();
        var term = _allTerminals[ this.terminals[ dir === "east" ? "west" : "east" ] ];
        return term.tGoodness(now,_buffertime,departuretime);
    }


    function Terminal(c, n, l) {
        this.code = c;
        this.name = n;
        this.loc = l;
        this.tt = false;
    }
    Terminal.clearTTs = function() {
        for (var t in _allTerminals) {
            _allTerminals[t].tt = false;
        }
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
    };
    Terminal.allTerminals = function() {
        return _allTerminals;
    };
    Terminal.find = function(code) {
        return _allTerminals[code];
    };
    Terminal.prototype.tGoodness = function(now,buffer,departuretime) {
        // Time goodness depends on the departure time, the current time, travel time to this
        // terminal, and user-specified buffer time.
    	//
        // If we don't know the travel time, we can't estimate goodness
        // If we do know the travel time, our expected arrival is now + travel time,
        // to which we add buffer time to account for variability in travel time, desire to arrive early, ...
        // buffer time primarily affects what will appear "risky"
        //
        // If our expected arrival time is:
        //     after departure (with a fudge factor), it is too late
        //     less than buffer time before departure, it is risky
        //     otherwise okay.
        //
        if (this.tt === false) // ! not just falsey
            return "Unknown";
        else if (now + (0.9 * this.tt) >= departuretime)
            return "TooLate";
        else if (now + this.tt + buffer >= departuretime)
            return "Risky";
        else if (now + this.tt + buffer + 120 < departuretime)
        	// two hours is the *max* time we care about
            return "Indifferent";
        else
            return "Good";
    };
    var _allTerminals = {
        1 : new Terminal(1, "Anacortes", "48.502220, -122.679455"),
        3 : new Terminal(3, "Bainbridge Island", "47.623046, -122.511377"),
        4 : new Terminal(4, "Bremerton", "47.564990, -122.627012"),
        5 : new Terminal(5, "Clinton", "47.974785, -122.352139"),
        8 : new Terminal(8, "Edmonds", "47.811240, -122.382631"),
        9 : new Terminal(9, "Fauntleroy", "47.523115, -122.392952"),
        10 : new Terminal(10, "Friday Harbor", "48.535010, -123.014645"),
        11 : new Terminal(11, "Coupeville", "48.160592, -122.674305"),
        12 : new Terminal(12, "Kingston", "47.796943, -122.496785"),
        13 : new Terminal(13, "Lopez Island", "48.570447, -122.883646"),
        14 : new Terminal(14, "Mukilteo", "47.947758, -122.304138"),
        15 : new Terminal(15, "Orcas Island", "48.597971, -122.943985"),
        16 : new Terminal(16, "Point Defiance", "47.305414, -122.514123"),
        17 : new Terminal(17, "Port Townsend", "48.112648, -122.760715"),
        7 : new Terminal(7, "Seattle", "47.601767, -122.336089"),
        18 : new Terminal(18, "Shaw Island", "48.583991, -122.929351"),
        20 : new Terminal(20, "Southworth", "47.512130, -122.500970"),
        21 : new Terminal(21, "Tahlequah", "47.333023, -122.506999"),
        22 : new Terminal(22, "Vashon Island", "47.508616, -122.464127")
    };


    function Alert(id, codes, body) {
        this.id = id;
        this.codes = codes;
        this.body = body;
        this.unread = true;
    }
    Alert.allAlerts = function() {
        return _alertList;
    }
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
        return results;
    };
    Alert.hasAlerts = function (r,unreadonly) {
        if ( typeof r === "string" ) {
            r = Route.find(r);
        }
        for (var i in _alertList) {
            var a = _alertList[i];
            if ((a.codes & r.code) && (a.unread || !unreadonly)) {
                return true;
            }
        }
        return false;
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
                console.log("Alert for " + codes);
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
