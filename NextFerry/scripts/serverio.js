/* Lower level service functionality for NextFerry application.
 * This is primarily managing communication with the server, and
 * getting locations.   (Basically, anything asyncronous.)
 *
 * Pattern: functions that alter the internal state of the app have
 * a "listeners" property where interested parties can register to
 * be informed when the state has in fact been updated.
 */
var ServerIO = (function($) {
        var initURL = "http://nextferry.appspot.com/init";
        var travelURL = "http://nextferry.appspot.com/traveltimes";
        var appVersion = "4.0";

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
                    // TODO
                }
                else if (header === "allalerts") {
                    loadAlerts(body);
                }
                else {
                    // IGNORE.
                }
            }
        };

        var requestUpdate = function() {
            // returns the chainable request object
            return $.ajax({
                              url : initURL + "/" + appVersion + "/" + (window.localStorage["cachedate"] || ""),
                              dataType: "text",
                              success: processReply
                              // we just ignore failures
                          });
        };

        var requestTravelTimes = function(loc) {
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

        var module = {
            requestUpdate : requestUpdate,
            requestTravelTimes : requestTravelTimes,
            loadSchedule : loadSchedule,
            loadAlerts : loadAlerts
        };
        return module;
}(jQuery));