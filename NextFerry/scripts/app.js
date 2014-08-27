var app = (function ($, NextFerry) {
    var dir = "West";
    var testrun = false;
    
    var mainScroll;
    var timeScroll;
    var schedScroll;
    var alertScroll;

    //======= Initialization and event wiring
    
    var init = function() {
        if (testrun) {
            // for now just go to test page; later, make it a tab?
            $("#test-page").show();
            $("#main-page").hide();
            nextFerryTests();
        }
        else {
            // show the main page first, then init everything else.

            //$("#title").lettering();
            renderMainPage();
            goPage($("#main-page"));
            ServerIO.loadSchedule.listeners.add(renderTimes);
            if (window.localStorage["cache"]) {
                ServerIO.loadSchedule(window.localStorage["cache"]);
            }
            NextFerry.Alert.init();		
            ServerIO.requestUpdate();

            mainScroll = new IScroll("#outerwrap", { tap: true });
            timeScroll = new IScroll("#timeswrap", { scrollX: true, scrollY: false });
            updateScroller(mainScroll);
            updateScroller(timeScroll);


            schedScroll = new IScroll("#schedule-tab", { tap: true });
            alertScroll = new IScroll("#alerts-tab");
                    
            $("#direction").on("click",toggleDirection);
            $("#routes").on("tap", goSchedulePage);   // tap because that's what Iscroll sends
            $("#schedule-page").on("swipe",navigateTabs);
            $("#schedule-nav>li").on("click",navigateTabs);
            $("#schedule-list>li").on("tap", toggleSchedulePart);
        }
    };
    
    var updateScroller = function(scr,delay) {
        delay = delay || 10;
        setTimeout(function() {
            scr && scr.refresh();
        }, delay);
    };
    
    
    //======= Main Page Rendering and events
    
    var renderMainPage = function() {
        $("#direction").text(dir);
        renderRoutes();
        renderTimes();
        return false;
    };

    var routeTmpl = {
        West : "<li>{%= displayName.west %}</li>",
        East : "<li>{%= displayName.east %}</li>"
    };
    var timeTmpl = {
        West : "<li>&nbsp;{%each(i,v) this.data.futureDepartures('west') %}{%= NextFerry.timeString(v) %} {%/each%}</li>",
        East : "<li>&nbsp;{%each(i,v) this.data.futureDepartures('east') %}{%= NextFerry.timeString(v) %} {%/each%}</li>"
    };

    var renderRoutes = function() {
        $("#routes").empty();
        $.tmpl(routeTmpl[dir], NextFerry.Route.allRoutes()).appendTo("#routes");
    };
    var renderTimes = function() {
        $("#times").empty();
        $.tmpl(timeTmpl[dir], NextFerry.Route.allRoutes()).appendTo("#times");
        updateScroller(mainScroll);
        updateScroller(timeScroll);
    };
    
    var renderTimeList = function(lst) {
        var result = "";
        for (var i in lst) {
            if (i > 0) {
                result += "<br/>";
            }
            result += NextFerry.timeString(lst[i]);
        }
        return result;
    };
    
    var toggleDirection = function() {
        if ( dir === "West" ) {
            dir = "East";
        }
        else {
            dir = "West";
        }
        
		renderMainPage();
        return false;
    };
    
    //======= Schedule Page Rendering and events
    
    var goSchedulePage = function(e) {
        var target = e.target.innerText; // gets the route name
        renderSchedule(target);
        renderAlerts(target);
		goPage($("#schedule-page"));
        return false;
    };
    
    var renderSchedule = function(name) {
        // build the schedule page for this schedule
        var r = NextFerry.Route.find(name);
        $("#schedule-list .slide").hide();
        
        $("#wname1").text(r.termName("east"));
        $("#wname2").text(r.termName("east"));
        $("#ename1").text(r.termName("west"));
        $("#ename2").text(r.termName("west"));
        
        $("#wdam").html(renderTimeList(r.beforeNoon("west", "weekday")));
        $("#wdpm").html(renderTimeList(r.afterNoon("west", "weekday")));
        $("#weam").html(renderTimeList(r.beforeNoon("west", "weekend")));
        $("#wepm").html(renderTimeList(r.afterNoon("west", "weekend")));
        
        $("#edam").html(renderTimeList(r.beforeNoon("east", "weekday")));
        $("#edpm").html(renderTimeList(r.afterNoon("east", "weekday")));
        $("#eeam").html(renderTimeList(r.beforeNoon("east", "weekend")));
        $("#eepm").html(renderTimeList(r.afterNoon("east", "weekend")));
        
        updateScroller(schedScroll,700);
    };
    
    var toggleSchedulePart = function() {
        $(this).children(".slide").slideToggle();
        $(this).children(".icon").toggleClass("open closed");
        updateScroller(schedScroll,700);
        return false;
    };
    
    var alertTmpl = "<li>{%= body %}</li>";
    
    var renderAlerts = function(name) {
    	// build the alerts page if there are any, otherwise hide the alerts page.
        var alist = NextFerry.Alert.alertsFor(name);
        if (alist.length) {
            $("#alerts-list").empty();
			$.tmpl(alertTmpl, alist).appendTo("#alerts-list");
            $("#sn-alerts").show();
            $("#alerts-tab").show();
            updateScroller(alertScroll);
        }
        else {
            $("#alerts-tab").hide();
            $("#sn-alerts").hide();
        }
    };
    
    //======= Tab Transitions
    
    var currentTab;
    var scrollPoints = {
        "sn-sched" : 0,
        "sn-alerts" : 325,
        "sn-more" : 650
    };
    
    var navigateTabs = function(e) {
        console.log(e);
        if (e.type === "click") {
            currentTab = e.currentTarget.id;      
        }
        
        if (currentTab === "sn-back") {
            backPage();
        }
        else {
            $("#schedule-tab-container").scrollLeft( scrollPoints[currentTab] );
        }
        return false;
    };
    
    //======= Page Transitions
    // goPage and backPage are for page *transitions*.
    // do not use them for re-rendering the same page.
    
    var currentPage;	// these are selectors (the "#id" string), not html objects.
    var prevPage;
    
    var goPage = function(p) {
        if ( currentPage && currentPage === p.selector ) {
            console.log("assertion failure: goPage called to rerender the same page!");
        }
        p.show();
        $(currentPage).hide();
        prevPage = currentPage;
        currentPage = p.selector;
        return false;
    };
    
    var backPage = function() {
        // kinda hand-wavy; the app never goes more than two levels deep.
        if ( prevPage && prevPage !== "#main-page") {
            $(prevPage).show();
            currentPage && $(currentPage).hide();
            currentPage = prevPage;
        }
        else if ( currentPage === "#main-page" ) {
            // todo: when we wire the android back button in, we'll have to handle this case.
        }
        else {
            goPage($("#main-page"));
        }
        // prevPage is always cleared, no matter where we came from.
        // (hence, the 2nd "back" always goes to the #main-page.)
        prevPage = false;
        return false;
    }
    
    //======= Retreiving Information from the Server

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

        var submodule = {
            requestUpdate : requestUpdate,
            requestTravelTimes : requestTravelTimes,
            processReply : processReply,
            loadSchedule : loadSchedule,
            loadAlerts : loadAlerts
        };
        return submodule;
    }());

    //======= Utilities
    
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