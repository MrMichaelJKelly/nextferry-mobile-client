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
            $("#title").lettering();
            renderMainPage();
            goPage($("#main-page"));
            ServerIO.loadSchedule.listeners.add(renderTimes);
            if ( window.localStorage["cache"] ) {
                ServerIO.loadSchedule( window.localStorage["cache"] );
            }
            ServerIO.requestUpdate();

            mainScroll = new IScroll("#outerwrap", { tap: true });
            timeScroll = new IScroll("#timeswrap", { scrollX: true, scrollY: false });
            updateScroller(mainScroll);
            updateScroller(timeScroll);

            schedScroll = new IScroll("#schedule-tab", { click: true });
            alertScroll = new IScroll("#alerts-tab");

            // wire up all the event actions
            $("#direction").on("click", toggleDirection);
            $("#routes").on("tap", goSchedulePage);   // tap because that's what Iscroll sends
            $("#schedule-page").on("swipe",navigateTabs);
            $("#schedule-nav>li").on("click",navigateTabs);
            $("#schedule-list>li").on("click", toggleSchedulePart);

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
        return false;
    };

    var renderRoutes = function() {
        $("#routes").empty();
        $("#routes").append( NextFerry.Route.displayRoutes().map( function(r) {
            return $( "<li>" + r.displayName[dir] + "</li>" );
        }));
    };
    var renderTimes = function() {
        var now = NextFerry.NFDate.nowT();
        // <li><span class='timegoodness'>time</span> <span>...</li>
        $("#times").empty();
        $("#times").append( NextFerry.Route.displayRoutes().map( function(r) {
            return $( "<li>" + "".concat( r.futureDepartures(dir).map( function(tt) {
                return "<span class='" + r.tGoodness(dir,tt,now) + "'> " + 
                       NextFerry.timeString(tt) + 
                       "</span>";
            } )) + "</li>");
        }));
        updateScroller(mainScroll);
        updateScroller(timeScroll);
    };


    var toggleDirection = function(e) {
        e.preventDefault();
		dir = ( dir === "west" ? "east" : "west" );
		renderMainPage();
        ServerIO.requestTravelTimes();
        return false;
    };

    //======= Schedule Page Rendering and events

    var goSchedulePage = function(e) {
        e.preventDefault();
        console.log(e);
        console.log(e.type + ":" + e.currentTarget.tagName);
        var routename = e.target.innerText;
        renderSchedule(routename);
        renderAlerts(routename);
		goPage($("#schedule-page"));
        return false;
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
            result += NextFerry.timeString(lst[i]);
        }
        return result;
    };

    var tapdance = false;	// prevent inadvertant double-click behavior on my android.
    var toggleSchedulePart = function(e) {
        e.preventDefault();
        if ( !tapdance ) {	// don't respond to event until previous event is done.
            tapdance = true;
            console.log(e);
            console.log(e.type + ":" + e.currentTarget.tagName);
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

    //======= Settings
    var showSettings = function() {

    };
    



    var module = {
        init : init
    };

    return module;
}(jQuery));
