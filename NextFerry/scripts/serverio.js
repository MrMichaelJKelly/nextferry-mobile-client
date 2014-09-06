/* Lower level service functionality for NextFerry application.
 * This is primarily managing communication with the server, and
 * getting locations.   (Basically, anything asyncronous.)
 *
 * Pattern: functions that alter the internal state of the app have
 * a "listeners" property where interested parties can register to
 * be informed when the state has in fact been updated.
 */
var ServerIO = (function($) {
    var appVersion = "4.0";
    var initURL = "http://nextferry.appspot.com/init/" + appVersion + "/";
    var travelURL = "http://nextferry.appspot.com/traveltimes/" + appVersion + "/";

    var loadSchedule = function(text) {
        var lines = text.split("\n");
        for (var i in lines) {
            if (lines[i].length > 2 && lines[i][0] !== "/") {
                NextFerry.Route.loadTimes(lines[i]);
            }
        }
        loadSchedule.listeners.fire();
    };
    loadSchedule.listeners = $.Callbacks();

    var loadAlerts = function(text) {
        NextFerry.Alert.loadAlerts(text);
        loadAlerts.listeners.fire();
    };
    loadAlerts.listeners = $.Callbacks();

    var loadTravelTimes = function(text) {
        NextFerry.Terminal.loadTTs(text);
        loadTravelTimes.listeners.fire();
    };
    loadTravelTimes.listeners = $.Callbacks();

    var processReply = function(data, status, jqXHR) {
        // we use the same function to look through all data sent to us
        // the reply is text format, with sections indicated by
        // lines beginning with '#'
        // So start by breaking on that...
        var chunks = data.split("\n#");
        if (chunks[0][0] === "#") {
            chunks[0] = chunks[0].slice(1);
        }
        for (var i in chunks) {
            var firstnewline = chunks[i].indexOf("\n");
            var header = chunks[i].slice(0, firstnewline);
            var body = chunks[i].slice(firstnewline);
            if (beginsWith(header, "schedule")) {
                loadSchedule(body);
                window.localStorage["cachedate"] = header.slice("schedule ".length);
                window.localStorage["cache"] = body;
            }
            else if (header === "special") {
                loadSchedule(body);
            }
            else if (header === "traveltimes") {
                loadTravelTimes(body);
            }
            else if (header === "allalerts") {
                loadAlerts(body);
            }
			// else IGNORE
        }
    };

    var requestUpdate = function() {
        // returns the chainable request object
        return $.ajax({
                  url : initURL + (window.localStorage["cachedate"] || ""),
                  dataType: "text",
                  success: processReply
                  // we just ignore failures
               });
    };


    var _requestTTdelay = false;
    var requestTravelTimes = function() {
        if ( _requestTTdelay ) {
            return;
        }
        else {
            // timer prevents calling this too often.
            _requestTTdelay = true;
            setTimeout( function() { _requestTTdelay = false; }, 20000);
            // asynch request to get current position which
            //   calls asynch request to get travel times
            getAccuratePosition( function(loc) {
                console.log(loc);
                // loc.coords.latitude = 47.860904;	// for spoofing in simulator
                // loc.coords.longitude = -122.549452;
                $.ajax({
                    url: travelURL +  loc.coords.latitude + "," + loc.coords.longitude,
                    dataType: "text",
                    success: processReply
                });
            });
        }
    };


    function beginsWith(s1, s2) {
        var i = 0;
        for (; i < s1.length && i < s2.length; i++) {
            if (s1.charAt(i) !== s2.charAt(i)) {
                return false;
            }
        }
        return (i === s2.length);
    }
    function noop() { };

    var settings = {
        useLocation : false,
    }
    var settingsChanged = function() {
        window.localStorage["settings"] = settings;
        settingsChanged.listeners.fire();
    }
    settingsChanged.listeners = $.Callbacks();

    var module = {
        requestUpdate : requestUpdate,
        requestTravelTimes : requestTravelTimes,
        loadSchedule : loadSchedule,
        loadAlerts : loadAlerts,
        loadTravelTimes : loadTravelTimes,
        settings: settings,
        settingsChanged : settingsChanged
    };
    return module;
}(jQuery));
