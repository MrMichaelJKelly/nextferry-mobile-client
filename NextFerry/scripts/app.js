/* Main entry point for the NextFerry Application
 * Approximately the View portion from an MVC perspective.
 */

var app = (function ($) {
    var dir = "west";
    var testrun = false;

    var mainScroll;
    var timeScroll;
    var schedScroll;
    var alertScroll;
    var settingsScroll;

    //======= Initialization and event wiring

    var init = function() {
        NextFerry.init();
        if (testrun) {
            // for now just go to test page; later, make it a tab?
            $("#test-page").show();
            $("#main-page").hide();
            nextFerryTests();
        }
        else {
            // immediately show the main page
            $("#title").lettering();
            goPage("#main-page");

            // wire up asynch responses
            ServerIO.loadSchedule.listeners.add(renderTimes);
            ServerIO.loadTravelTimes.listeners.add(updateTravelTimes);

            // initialize main page travel times and generalized update
            if ( window.localStorage["cache"] ) {
                ServerIO.loadSchedule( window.localStorage["cache"] );
            }
            ServerIO.requestUpdate();

            // initialize scrollers
            mainScroll = new IScroll("#outerwrap", { tap: true });
            timeScroll = new IScroll("#timeswrap", { scrollX: true, scrollY: false });
            updateScroller(mainScroll);
            updateScroller(timeScroll);

            schedScroll = new IScroll("#schedule-tab", { click: true });
            alertScroll = new IScroll("#alerts-tab");
            settingsScroll = new IScroll("#settings-page");

            // wire up all the event actions
            $("#direction").on("click", toggleDirection);
            $("#routes").on("tap", gogoPage("#schedule-page"));   // tap because that's what Iscroll sends
            $("#schedule-page").on("swipe",navigateTabs);
            $("#schedule-nav>li").on("click",navigateTabs);
            $("#schedule-list>li").on("click", toggleSchedulePart);
            $(".settingsfloater").on("click", gogoPage("#settings-page"));
            $(".setnav").on("click", inSettingsNav);

            //feedback.initialize('50377a40-30e3-11e4-9c7b-3512796cc48e');
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
        ServerIO.requestTravelTimes();
    };

    var renderRoutes = function() {
        $("#routes").empty();
        $("#routes").append( NextFerry.Route.displayRoutes().map( function(r) {
            return $( "<li>" + r.displayName[dir] + "</li>" );
        }));
    };
    var renderTimes = function() {
        var now = NextFerry.NFTime.now();
        // <li><span class='timegoodness'>time</span> <span>...</li>
        $("#times").empty();
        $("#times").append( NextFerry.Route.displayRoutes().map( function(r) {
            return $( "<li>" + "".concat( r.futureDepartures(dir).map( function(tt) {
                return "<span class='" + r.tGoodness(dir,tt,now) + "'> " +
                       NextFerry.NFTime.display(tt) +
                       "</span>";
            } )) + "</li>");
        }));
        updateScroller(mainScroll);
        updateScroller(timeScroll);
    };

    var updateTravelTimes = function() {
        // let's wait and see if we need to be clever or not.
        renderTimes();
    };


    var toggleDirection = function(e) {
        e.preventDefault();
		dir = ( dir === "west" ? "east" : "west" );
		renderMainPage();
        ServerIO.requestTravelTimes();
        return false;
    };

    //======= Schedule Page Rendering and events

    var _routename;
    var renderSchedulePage = function(e) {
        if ( e ) {
            _routename = e.target.innerText;
            console.log( "changing schedule page to " + _routename);
        }
        if ( ! _routename ) {
            alert("error! called SchedulePage without route! (bug in code, please report)");
            backPage();
        }
        else {
            renderSchedule(_routename);
            renderAlerts(_routename);
        }
    };

    var renderSchedule = function(name) {
        // build the schedule page for this schedule
        var r = NextFerry.Route.find(name);
        $("#schedule-list .slide").hide();
        tapdance = false; // see below

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

    var renderTimeList = function(lst) {
        var result = "";
        for (var i in lst) {
            if (i > 0) { result += "<br/>"; }
            result += NextFerry.NFTime.display(lst[i]);
        }
        return result;
    };

    var tapdance = false;	// prevent inadvertant double-click behavior on my android.
    var toggleSchedulePart = function(e) {
        e.preventDefault();
        if ( !tapdance ) {	// don't respond to event until previous event is done.
            tapdance = true;
            //console.log(e);
            //console.log(e.type + ":" + e.currentTarget.tagName);
            $(this).children(".slide").slideToggle(200);
            $(this).children(".icon").toggleClass("open closed");
            updateScroller(schedScroll,350);
            setTimeout(function() { tapdance = false; }, 400);
        }
        return false;
    };


    var renderAlerts = function(name) {
    	// build the alerts page if there are any, otherwise hide the alerts page.
        var alist = NextFerry.Alert.alertsFor(name);
        if (alist.length) {
            $("#alerts-list").empty();
			$("#alerts-list").append( alist.map(function(a) { return "<li>" + a.body + "</li>"; }));
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
        e.preventDefault();
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


    //======= Settings Page

    var renderSettingsPage = function() {
        $(".setting-parts").hide();
        $("#settings-routes-form").empty();
        $("#settings-routes-form").append( NextFerry.Route.allRoutes().map(
            function(r) {
                var id = "r" + r.code;
                return $( "<p><input type='checkbox' class='routedisplay' id='" + id +
                    ( r.isDisplayed() ? "' checked>" : "'>") +
                    "<label for='" + id + "'>" + r.displayName.west + "</label>" +
                    "</p>");
        }));
        var tf = window.localStorage["timeformat"] || "tf12";
        $("#" + tf).prop( "checked", true );    // checks either tf12 or tf24

         $("#useloc").prop( "checked", (window.localStorage["useloc"] === "true"));

        /*
        $("#buftime").value( window.localStorage["buffertime"] );
        if ( window.localStorage["vashondir"] ) {
            // etc.
        }
        else {
            // etc.
        }
        // TODO: set the schedule name on about.
        */

        updateScroller(settingsScroll);
    };

    var saveSettings = function() {
        $(".routedisplay").each( function() {
            var code = $(this).prop("id").substr(1);
            NextFerry.Route.find(code).display( this.checked );
        });
        NextFerry.Route.saveDisplaySettings();

        var timeformat = $("input:radio[name=tf]:checked").prop( "id" );
        window.localStorage["timeformat"] = timeformat;
        NextFerry.NFTime.setDisplayFormat(timeformat);

        var useloc = $("#useloc").prop("checked");
        if ( useloc.toString() !== window.localStorage["useloc"]) {
            window.localStorage["useloc"] = useloc;
            if ( ! useloc ) {
                // immediately remove any travel times we've previously computed
                // (really this should be a subscription point for anything that
                // theoretically might be using locations).
                NextFerry.Terminal.clearTTs();
                // we don't have to update the goodness codes directly b/c
                // they will be re-computed when we re-visit the page.
            }
        }
/*
        var buffertime = $("#buftime").value();
        window.localStorage["buffertime"] = buffertime;
        // TODO: use

        var vashondir = true; // TODO
        window.localStorage["vashondir"] = vashondir;
        // TODO: use
        */
    };

    var inSettingsNav = function(e) {
        e.preventDefault();
        var dest = e.currentTarget.getAttribute("dest");
        if ( dest === "exit" ) {
            saveSettings();
            backPage();
        }
        else if ( dest === "list" ) {
            $(".settings-part").hide();
            $("#settings-list").show();
            updateScroller(settingsScroll);
        }
        else {
            $("#settings-list").hide();
            $("#" + dest).show();
            updateScroller(settingsScroll);
        }
        return false;
    };

    //======= Page Transitions
    // goPage and backPage are for page *transitions*.
    // using them to re-render a page will screw up the back behavior.

    var currentPage;	// the "#id" string (not html element)
    var prevPage;

    var renderers = {
        "#main-page" : renderMainPage,
        "#schedule-page" : renderSchedulePage,
        "#settings-page" : renderSettingsPage
    };

    var goPage = function(p,e) {
        if ( currentPage && currentPage === p ) {
            alert("error! goPage called to rerender the same page! (please report bug)");
        }
        renderers[p](e);
        $(p).show();
        $(currentPage).hide();
        prevPage = currentPage;
        currentPage = p;
    };

    // produces an event handler to go to a specific page
    var gogoPage = function(p) {
        return function(e) {
            e.preventDefault();
            goPage(p,e);
            return false;
        };
    };

    var backPage = function() {
        // todo: wire in android back button behavior to exit if on main page.
        goPage( prevPage ? prevPage : "#main-page" );
        // prevPage is always cleared, no matter where we came from.
        // (hence, the 2nd "back" always goes to the #main-page.)
        prevPage = false;
        return false;
    }


    var module = {
        init : init,
        // for testing
        renderSettingsPage : renderSettingsPage,
        saveSettings : saveSettings
    };

    return module;
}(jQuery));
