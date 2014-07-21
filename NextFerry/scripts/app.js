var app = (function ($, NextFerry) {
    var dir = "west";
    var mainScroll;
    var timeScroll;

    var init = function() {
        renderRoutes();
        ServerIO.loadSchedule.listeners.add(renderTimes);

        if (window.localStorage["cache"]) {
            ServerIO.loadSchedule(window.localStorage["cache"]);
        }
        ServerIO.requestUpdate();

        mainScroll = new IScroll("#outerwrap");
        timeScroll = new IScroll("#timeswrap", {
                                     scrollX: true,
                                     scrollY: false
                                 });
       
        renderSchedule("bainbridge");
        $("#main-page").hide();
        $("#schedule-page").show();
        $("#schedule-tab").show();
        //updateMainScrollers();
    };
    
    var updateMainScrollers = function() {
        setTimeout(function () {
            timeScroll && timeScroll.refresh();
            mainScroll && mainScroll.refresh();
        }, 10);  
    };
    
    /* Main Page Layout */

    var routeTmpl = {
        west : "<li>{%= displayName.west %}</li>",
        east : "<li>{%= displayName.east %}</li>"
    };
    var timeTmpl = {
        west : "<li>&nbsp;{%each(i,v) this.data.futureDepartures('west') %}{%= NextFerry.timeString(v) %} {%/each%}</li>",
        east : "<li>&nbsp;{%each(i,v) this.data.futureDepartures('east') %}{%= NextFerry.timeString(v) %} {%/each%}</li>"
    }

    var renderRoutes = function() {
        $("#routes").empty();
        $.tmpl(routeTmpl[dir], NextFerry.allRoutes).appendTo("#routes");
    }
    var renderTimes = function() {
        $("#times").empty();
        $.tmpl(timeTmpl[dir], NextFerry.allRoutes).appendTo("#times");
        updateMainScrollers();
    }
    
    /* Schedule Page Layout */
    
    var renderTimeList = function( lst ) {
        var result = "";
        for( var i in lst ) {
            if ( i>0 ) { result += "<br/>"; }
            result += NextFerry.timeString( lst[i] );
        }
        return result;
    };
    
    var renderSchedule = function(name) {
        // build the schedule page for this schedule
        var r = NextFerry.Route.find(name);
        $("#wname1").text(r.termName("west"));
        $("#wname2").text(r.termName("west"));
		$("#wdam").html( renderTimeList( r.beforeNoon( "west", "weekday" )));
        $("#wdpm").html( renderTimeList( r.afterNoon( "west", "weekday" )));
        $("#weam").html( renderTimeList( r.beforeNoon( "west", "weekend" )));
        $("#wepm").html( renderTimeList( r.afterNoon( "west", "weekend" )));
    };

    var ServerIO = (function() {
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
                    // TODO
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

        var submodule = {
            requestUpdate : requestUpdate,
            requestTravelTimes : requestTravelTimes,
            processReply : processReply,
            loadSchedule : loadSchedule,
            loadAlerts : loadAlerts
        };
        return submodule;
    }());

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
        init : init,
        ServerIO : ServerIO
    };

    return module;
}(jQuery, NextFerry));