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
    // Testing infrastucture: spoof time by overriding any of these functions
    // Note you can cause recomputation of todaysScheduleType by setting
    // the cached value to null.
    var NFDate = {
        _tschedt : null,
        nowD : function() {
            return new Date(Date.now());
        },
        getHours : function(d) {
            return d.getHours();
        },
        getMinutes : function(d) {
            return d.getMinutes();
        },
        getDay : function(d) {
            return d.getDay();
        },
        nowT : function() {
            var dt = NFDate.nowD();
            var x = NFDate.getHours(dt) * 60 + NFDate.getMinutes(dt);
            return adjustTime(x);
        },
        todaysScheduleType : function() {
            if (!NFDate._tschedt) {
                var today = NFDate.nowD();
                var time = (NFDate.getHours(today) * 60) + NFDate.getMinutes(today);
                var dow = NFDate.getDay(today);
                if (time < MorningCutoff) {
                    dow -= 1;
                }
                NFDate._tschedt =
                (dow < 1 || dow > 5) ? "weekend" : "weekday";
            }
            return NFDate._tschedt;
        }
    };

    // module private functionality: manipulating times
    // times are minutes past midnite, with some caveats (see original code)
    var Noon = 12 * 60;
    var MorningCutoff = 150; // 2:30 am

    // WSDOT essentially has a different concept of
    // when today becomes tomorrow.  Here we correct
    // for that by using times > 24H for early morning
    // times.
    function adjustTime(t) {
        return (t < MorningCutoff ? t + 24 * 60 : t);
    }

    // caches for the string output for times.
    var cache12 = {};
    var cache24 = {};
    // Create printable strings for times, a bit faster
    // than creating date objects.  And cache them.
    function display12(t) {
        if (!cache12[t]) {
            var hours = Math.floor(t / 60);
            var minutes = t % 60;
            if (hours > 24)
                hours -= 24;
            if (hours > 12)
                hours -= 12;
            if (hours === 0)
                hours = 12;
            cache12[t] = hours + ":" + (minutes < 10 ? "0" : "") + minutes;
        }
        return cache12[t];
    }
    function display24(t) {
        if (!cache24[t]) {
            var hours = Math.floor(t / 60);
            var minutes = t % 60;
            if (hours >= 24)
                hours -= 24;
            cache24[t] =
            (hours < 10 ? "0" : "") + hours +
            ":" +
            (minutes < 10 ? "0" : "") + minutes;
        }
        return cache24[t];
    }

    // public display functions
    var timeString = display12;
    function setTimeFormat(as12) {
        NextFerry.timeString = (as12 ? display12 : display24);
    }


    var _allRoutes = [];    // main data structure: all routes and schedules
    var _displayList = {};  // user-chosen set of routes to display
    var _alertList = [];    // list of all alerts (not persisted)
    var _readList = [];     // list of alerts the user has already read
    // sets are represented by js object attributes (with value = true)

    var init = function() {
        _allRoutes = [
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
        // routes are "schedule-less" until main app init.

        _displayList = window.localStorage["displayList"];
        if ( ! _displayList ) {
            // default: display all routes
            _displayList = {};
            for( var i in _allRoutes ) {
                _displayList[_allRoutes[i].displayName["west"]] = true;
            }
        }

        _readList = window.localStorage["readList"] || [];
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
    }
    Route.displayRoutes = function() {
        var result = [];
        for (var i in _displayList) {
            result.push(Route.find(i));
        }
        return result;
    }
    Route.find = function(name) {
        for (var i in _allRoutes) {
            var r = _allRoutes[i];
            if (r.displayName.west === name || r.displayName.east === name) {
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
        return this.times.west.special ? "special" : NFDate.todaysScheduleType();
    };
    // times the ferry departs after now, today
    Route.prototype.futureDepartures = function(dir, sched) {
        sched = sched || this.todaysSchedule();
        var lst = this.times[dir][sched];
        var t = NFDate.nowT();
        return (lst ? lst.filter(function(e, i) {
            return (e > t);
        }) : []);
    };
    Route.prototype.beforeNoon = function(dir, sched) {
        sched = sched || this.todaysSchedule();
        var lst = this.times[dir][sched];
        return (lst ? lst.filter(function(e, i) {
            return (e < Noon);
        }) : []);
    };
    Route.prototype.afterNoon = function(dir, sched) {
        sched = sched || this.todaysSchedule();
        var lst = this.times[dir][sched];
        return (lst ? lst.filter(function(e, i) {
            return (e >= Noon);
        }) : []);
    };
    Route.prototype.termName = function(dir) {
        return _allTerminals[this.terminals[dir]].name;
    }
    Route.prototype.hasNewAlerts = function() {
		return Alert.hasAlerts(this,true);
    };


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
                _allTerminals[pieces[0]].tt = pieces[1];               
            }
        }
    };
    Terminal.allTerminals = function() {
        return _allTerminals;
    };
    Terminal.find = function(code) {
        return _allTerminals[code];
    }
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

    // Goodness depends on the departure time, the current
    // time, travel time, and how much of a buffer you want
    // to leave.
    function timeGoodness(now, tt, buffer, departure) {
        if (tt === false) // ! not just falsey
            return "Unknown";
        else if (now + 0.95 * (tt + buffer) > departure)
            return "TooLate";
        else if (now + tt + buffer > departure)
            return "Risky";
        else if (now + tt + buffer + 120 < departure)
        // two hours is the *max* time we care about
            return "Indifferent";
        else
            return "Good";
    }

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
        NFDate : NFDate,
        Route : Route,
        Terminal : Terminal,
        Alert : Alert,
        timeString : timeString,
        setTimeFormat : setTimeFormat,
        timeGoodness : timeGoodness
    };

    return module;
}(jQuery));
