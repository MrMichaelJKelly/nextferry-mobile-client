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

        // immediately show the main page
        $("#title").lettering();
        goPage("#main-page");

        // wire up asynch responses
        ServerIO.loadSchedule.listeners.add(renderTimes);
        ServerIO.loadTravelTimes.listeners.add(updateTravelTimes);
        ServerIO.loadAlerts.listeners.add(updateAlerts);

        // initialize main page travel times and generalized update
        if ( window.localStorage["cache"] ) {
            ServerIO.loadSchedule( window.localStorage["cache"] );
        }
        ServerIO.requestUpdate();

        // one-time rendering for settings page
        settingsRenderOnce();

        // wire up all the event actions
        $("#direction").on("click", toggleDirection);
        $("#routes").on("tap", gogoPage("#schedule-page"));   // tap because that's what Iscroll sends
        $("#schedule-page").on("swipe",navigateTabs);
        $("#schedule-nav>li").on("click",navigateTabs);
        $("#schedule-list>li").on("click", toggleSchedulePart);
        $("#settings-nav>li").on("click", settingsNav);
        $(".settings-exit").on("click", settingsExit);
        $("span[type]").on("click", handleClicks);
        $("#useloc").on("change",updateDisable);
        $("#reload").on("click",reset);

        $("#buftime").rangeslider({
            polyfill: false,
            onSlide: function(pos,val) {
                $("#buftimeval").text( val.toString() );
            }
        });

        // initialize main page scrollers
        mainScroll = new IScroll("#outerwrap", { tap: true });
        timeScroll = new IScroll("#timeswrap", { scrollX: true, scrollY: false });
        //updateScroller(timeScroll);
        //updateScroller(mainScroll,100);

        // done with app construction
        // if test run, divert to test page
        if (testrun) {
            $("#test-page").show();
            $("#main-page").hide();
            nextFerryTests();
            new IScroll("#qunit-scroll-container");
        }
    };

    var reset = function(e) {
        e && e.preventDefault();
        NextFerry.reset();
        ServerIO.requestUpdate();
        return false;
    };

    var updateScroller = function(scr,delay) {
        setTimeout(function() {
            scr && scr.refresh();
        }, delay || 10);
    };


    //======= Main Page Rendering

    var renderMainPage = function() {
        $("#direction").text(dir);
        renderRoutes();
        renderTimes();
        updateScroller(mainScroll,200);
        ServerIO.requestTravelTimes();
    };

    var renderRoutes = function() {
        $("#routes").empty();
        $("#routes").append( NextFerry.Route.displayRoutes().map( function(r) {
            return $( "<li id='rr" + r.code + "'>" +
                "<span class='icon alert' astate='alerts_none'></span> " +
                r.displayName[dir] + "</li>" );
        }));
        updateAlerts();
    };
    var renderTimes = function() {
        var now = NextFerry.NFTime.now();
        // <li><span><span class='timegoodness'>time</span> <span>...</span></li>
        $("#times").empty();
        $("#times").width(1500); // wider than needed; will be recalculated below.
        $("#times").append( NextFerry.Route.displayRoutes().map( function(r) {
            return $( "<li><span>" + "".concat( r.futureDepartures(dir).map( function(tt) {
                return "<span class='" + r.tGoodness(dir,tt,now) + "'> " +
                       NextFerry.NFTime.display(tt) +
                       "</span>";
            } )) + "<span></li>");
        }));
        fixWidth();
        updateScroller(timeScroll,100);
    };

    var updateTravelTimes = function() {
        // let's wait and see if we need to be clever or not.
        console.log("updating travel times");
        renderTimes();
    };

    var updateAlerts = function() {
        // this is not at all efficient, but it doesn't matter.
        $("#routes>li").each( function(i,e) {
            var route = NextFerry.Route.find( $(e).prop("id").substr(2) );
            $(e).children("span").attr("astate", route.hasAlerts());
        });
    };

    // Calculate native width of text in each list item, and truncate the
    // width of the container to that.
    // Based on solutions found at http://stackoverflow.com/questions/1582534/calculating-text-width-with-jquery
    // but using slightly different trick: (a) we've added an extra <span>
    // element inside the <li> so that we have an inline element to measure against,
    // and (b) we initially set the width of $("#times") so that it is wide enough to
    // guarantee no line-breaking.
    // (amazing how much hassle this little bit of functionality was to figure out...)
    var fixWidth = function( ) {
        var max = 0;
        $("#times li>span").each( function(i,e) {
            var x = $(e).width();
            if (x > max) { max = x; }
        });
        $("#times").width( max+10 );
    };

    var toggleDirection = function(e) {
        e.preventDefault();
		dir = ( dir === "west" ? "east" : "west" );
        if (dir === "east") {
            $("#main-page").addClass("east");
        }
        else {
            $("#main-page").removeClass("east");
        }
		renderMainPage();
        return false;
    };

    //======= Schedule Page Rendering and events

    var _routename;
    var renderSchedulePage = function(e) {
        if ( e ) {
            _routename = e.target.innerText;
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

        schedScroll = (schedScroll ||
            new IScroll("#schedule-tab", {
                click: true,
                eventPassthrough: "horizontal" }));
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

    var toggleSchedulePart = function(e) {
        e.preventDefault();
        if ( debounced() ) {
            $(this).children(".slide").slideToggle(200);
            $(this).children(".icon").toggleClass("open closed");
            updateScroller(schedScroll,350);
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
            alertScroll = (alertScroll || new IScroll("#alerts-tab"));
            updateScroller(alertScroll);
        }
        else {
            $("#alerts-tab").hide();
            $("#sn-alerts").hide();
        }
    };

    //======= Schedule Page Tab Transitions

    var currentTab;
    var scrollPoints = {
        "sn-sched" : 0,
        "sn-alerts" : 325,
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


    //======= Settings Page(s)
    // If I were writing this over, I would probably make three different
    // pages sharing a common style, instead of three pagelets on a single
    // page.  The reason for keeping it this way now is that
    // a) "return" works the way I want it to
    // b) the setttings state is only saved on exit, hence re-rendering
    //    the pagelets when moving between them would not work.

    var settingsScrollers = {
        "#settings-routes": undefined,
        "#settings-options": undefined,
        "#settings-about": undefined
    };

    var settingsNav = function(e) {
        e.preventDefault();
        if (currentPage !== "#settings-page") {
            goPage("#settings-page");
        }
        else {
            $(".settings-part").hide();
        }

        var dest = "#settings-" + e.currentTarget.getAttribute("dest");
        $(dest).show();
        settingsScrollers[dest] = settingsScrollers[dest] ||
            new IScroll(dest + "-wrapper", { click: true });
        updateScroller(settingsScrollers[dest]);
        return false;
    };

    var settingsExit = function() {
        saveSettings();
        backPage();
    };

    var settingsRenderOnce = function() {
        // fill in the route list, which we only need to do once.
        $("#settings-routes-form").empty();
        $("#settings-routes-form").append( NextFerry.Route.allRoutes().map(
            function(r) {
                var id = "r" + r.code;
                return $( "<span type='checkbox' id='" +
                    id + "' class='routedisplay'>" +
                    r.displayName.west + "</span><br>");
        }));
    };

    var _btdisplay; // the numeric version
    var renderSettingsPage = function() {
        $(".settings-part").hide();
        $("#settings-page span[type]").removeClass("checked");
        NextFerry.Route.displayRoutes().map(
            function(r) {
                $("#r" + r.code).addClass("checked");
            });

        var tf = window.localStorage["tf"];
        $("#" + tf).addClass("checked");    // checks either tf12 or tf24

        if ( window.localStorage["useloc"] === "true" ) {
            $("#useloc").addClass("checked");
        }

        if ( _btdisplay === undefined ) {
            _btdisplay = parseInt( window.localStorage["bt"] );
        }
        $("#buftime").val( _btdisplay ).change();
        $("#buftimeval").text( _btdisplay.toString() );
        updateDisable();

        $("#aboutsched").text( window.localStorage["schedulename"] || "unknown" );

        /*
        if ( window.localStorage["vashondir"] ) {
            // etc.
        }
        else {
            // etc.
        }
        */
    };

    var saveSettings = function() {
        $(".routedisplay").each( function() {
            var code = $(this).prop("id").substr(1);
            NextFerry.Route.find(code).display( $(this).hasClass("checked") );
        });

        var timeformat = $("#tf span[type='radio'].checked").prop( "id" );
        window.localStorage["tf"] = timeformat;
        NextFerry.NFTime.setDisplayFormat(timeformat);

        var useloc = $("#useloc").hasClass("checked");
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

        if ( window.localStorage["bt"] != $("#buftime").val() ) {
            window.localStorage["bt"] = $("#buftime").val();
        }
        NextFerry.synchSettings();
        _btdisplay = undefined;
        /*
        var vashondir = true; // TODO
        window.localStorage["vashondir"] = vashondir;
        // TODO: use
        */
    };

    /* our own implementation of checkboxes and radio boxes,
     * because iScroll has problems with the native implementation.
     * NB: unbelievable that this is all it takes...
     */
    var handleClicks = function(e) {
        e.preventDefault();
        if ( debounced() ) {
            var target = $(e.target);
            if ( target.attr("type") === "checkbox" ) {
                target.toggleClass("checked");
                target.trigger( $.Event("change") );
            }
            else { // radio boxes
                if ( ! target.hasClass("checked") ) {
                    var oldval = target.parent().children("span[type='radio'].checked");
                    oldval.length > 0 && oldval.removeClass( "checked" );
                    target.addClass("checked");

                    oldval.length > 0 && oldval.trigger( $.Event("change") );
                    target.trigger( $.Event("change") );
                }
            }
        }
        return false;
    };

    var updateDisable = function(e) {
        var buftimeEnabled = $("#useloc").hasClass("checked");
        var buftime = $("#buftime");
        if (buftimeEnabled) {
            $("#buftimeitem").removeClass("disabled");
            buftime.prop("disabled",false);
        }
        else {
            $("#buftimeitem").addClass("disabled");
            buftime.prop("disabled",true);
        }
        buftime.rangeslider("update");
    };

    // Iscroll sometimes sends duplicate click events, so we debounce them.
    // The same debouncing timer is used for all events, which works fine,
    // assuming that the user cannot intend to issue events
    // faster than every 300 ms.
    var debouncing_on = false;
    var debounced = function() {
        if ( debouncing_on ) {
            return false;
        }
        else {
            debouncing_on = true;
            setTimeout(function() { debouncing_on = false; }, 300);
            return true;
        }
    };
    var clear_debounce = function() {
        debouncing_on = false;
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
    };

    var module = {
        init : init,
        // for testing
        reset : reset,
        renderSettingsPage : renderSettingsPage,
        saveSettings : saveSettings
    };

    return module;
}(jQuery));
