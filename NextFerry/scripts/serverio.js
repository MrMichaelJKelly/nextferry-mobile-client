/* Lower level service functionality for NextFerry application.
 * This is primarily managing communication with the server, and
 * getting locations.   (Basically, anything asyncronous.)
 *
 * Pattern: functions that alter the internal state of the app have
 * a "listeners" property where interested parties can register to
 * be informed when the state has in fact been updated.
 */
var ServerIO = (function($) {
    "use strict";

    var appVersion = "4.2";
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
                _lasttt = Date.now();
                _status = "received travel times from server.";
                if ( window.localStorage["useloc"] == "true" ) {
                    loadTravelTimes(body);
                }
            }
            else if (header === "traveltimestatus") {
                _status = body;
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
    var _cancellable = undefined;
    var _lastposition;
    var _lasttt;
    var _status = "not yet initialized.";

    var requestTravelTimes = function() {
        mylog("requesting travel times...");
        _cancellable = undefined;
        if ( window.localStorage["useloc"] != "true" || _requestTTdelay || _cancellable ) {
            // if the user doesn't want this, or we've just called,
            // or we're waiting on the result of the last call, then skip.
            mylog("not now");
            return;
        }
        else {
            // timer prevents calling this too often.
            _requestTTdelay = true;
            setTimeout( function() { _requestTTdelay = false; }, 20000);

            // asynch request to get current position which
            //   calls asynch request to get travel times
            _status = "detecting location.";
            _cancellable = smartPosition(
                function(loc) {
                    mylog("got position!");
                    _lastposition = Date.now();
                    _status = "location detected; waiting for travel times from server.";
                    _cancellable = undefined;
                    if ( loc.coords.accuracy < 150 ) {
                        $.ajax({
                            url: travelURL +  loc.coords.latitude + "," + loc.coords.longitude,
                            dataType: "text",
                            success: processReply,
                            error: handleError
                        });
                    }
                    else {
                        mylog("...but not accurate enough: " + loc.coords.accuracy );
                        _status = "location too inaccurate to estimate travel times.";
                        _requestTTdelay = false;
                    }
                },
                handleError, // error handler for smartPosition
                undefined,
                {
                    timeout: 3 * 60 * 1000,
                    maxtries: 3,
                    accuracy: 100,
                    maximumAge: 5 * 60 * 1000,
                }
            );
        }
    };

    var travelTimeStatus = function() {
        return { lastpos: _lastposition, lasttt: _lasttt, status: _status };
    }

    var handleError = function(ex) {
        _cancellable = undefined;
        switch( ex.code ) {
            case 1: _status = "cannot detect location: permission denied."; break;
            case 2: _status = "error occurred trying to detect location."; break;
            case 3: _status = "timed out trying to detect location."; break;
            // default: do nothing --- leave old _status message there.
        }
    };

    var onPause = function() {
        if ( typeof(_cancellable) === "function" ) {
            _cancellable();
            _cancellable = undefined;
        }
        _requestTTdelay = true;
    }
    var onResume = function() {
        _requestTTdelay = false;
        _cancellable = undefined;
        _status = "";
    };

    var beginsWith = function(s1, s2) {
        var i = 0;
        for (; i < s1.length && i < s2.length; i++) {
            if (s1.charAt(i) !== s2.charAt(i)) {
                return false;
            }
        }
        return (i === s2.length);
    };

    var module = {
        requestUpdate : requestUpdate,
        requestTravelTimes : requestTravelTimes,
        loadSchedule : loadSchedule,
        onPause : onPause,
        onResume : onResume,
        travelTimeStatus : travelTimeStatus,
        // for testing
        loadAlerts : loadAlerts,
        loadTravelTimes : loadTravelTimes
    };
    return module;
}(jQuery));
