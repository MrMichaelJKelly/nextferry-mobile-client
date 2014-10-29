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

    var handleError = function() {
        console.log( "Received error" );
        console.log( arguments );
    }

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
        //console.log("****process reply:");
        //console.log(data);
        // the same format is used for all responses.  it consists of a number
        // of sections separated by lines beginning with '#'
        var chunks = data.split("\n#");
        if (chunks[0][0] === "#") {
            chunks[0] = chunks[0].slice(1);
        }
        for (var i in chunks) {
            var firstnewline = chunks[i].indexOf("\n");
            var header = (firstnewline > 0 ? chunks[i].slice(0, firstnewline) : chunks[i]);
            var body = (firstnewline > 0 ? chunks[i].slice(firstnewline) : "");
            if (beginsWith(header, "schedule")) {
                loadSchedule(body);
                window.localStorage["cachedate"] = header.slice("schedule ".length);
                window.localStorage["cache"] = body;
            }
            else if (header === "special") {
                loadSchedule(body);
            }
            else if (header === "traveltimes") {
                // if the user turned off useloc in the meantime,
                // don't process the results.
                if ( window.localStorage["useloc"] == "true" ) {
                    loadTravelTimes(body);
                }
            }
            else if (header === "allalerts") {
                loadAlerts(body);
            }
            else if (beginsWith(header, "name")) {
                window.localStorage["schedulename"] = header.slice("name ".length);
            }
			// else IGNORE
        }
    };

    var requestUpdate = function() {
        // returns the chainable request object
        return $.ajax({
                  url : initURL + (window.localStorage["cachedate"] || ""),
                  dataType: "text",
                  success: processReply,
                  error: handleError
               });
    };

    var _requestTTdelay = false;
    var requestTravelTimes = function() {
        console.log("requesting travel times...");
        if ( window.localStorage["useloc"] != "true" || _requestTTdelay ) {
            // if the user doesn't want this, or we've just called, then skip.
            console.log("not now");
            return;
        }
        else {
            // timer prevents calling this too often.
            _requestTTdelay = true;
            setTimeout( function() { _requestTTdelay = false; }, 20000);
            // asynch request to get current position which
            //   calls asynch request to get travel times

            // for right now, in the simulator:
            //if ( "Position" in window ) {
            //    getAccuratePosition.spoof_value = new Position(new Coordinates(47.581688,-122.702252,100,150));
            //}

            getAccuratePosition(
                function(loc) {
                    console.log("got position!");
                    $.ajax({
                        url: travelURL +  loc.coords.latitude + "," + loc.coords.longitude,
                        dataType: "text",
                        success: processReply,
                        error: handleError
                    });
                },
                handleError // error handler for getAccuratePosition
            );
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

    var module = {
        requestUpdate : requestUpdate,
        requestTravelTimes : requestTravelTimes,
        loadSchedule : loadSchedule,
        // for testing
        loadAlerts : loadAlerts,
        loadTravelTimes : loadTravelTimes
    };
    return module;
}(jQuery));
