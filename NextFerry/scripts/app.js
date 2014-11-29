/* Main entry point for the NextFerry Application
 * Approximately the View portion from an MVC perspective.
 */

var app = (function ($) {

    var testrun = false; // set to true to run tests, false for normal app.

    //======= App state
    // Parameters that control the generation of pages.
    // main-page: which direction are we showing?
    var dir = window.localStorage["dir"] || "west";

    // details, schedules, alerts: which route are we showing?
    var route;

    // schedules: which direction and day are we showing?
    var scheduleDir;
    var scheduleDay;

    // setAlarm: which time element are we looking at? and what terminal is
    // the destination?
    var setAlarmElem;
    var setAlarmTerm;

    //////////////////////////////////////////////////////////////////////////
    //======= Initialization and event wiring

    var init = function() {
        NextFerry.init();
        $("#title").lettering();
        goPage("#main-page");

        // wire up asynch responses
        document.addEventListener("pause", onPause );
        document.addEventListener("unload", onPause );
        document.addEventListener("resume", onResume );
        document.addEventListener("orientationchange", onRotate );
        ServerIO.loadSchedule.listeners.add( renderTimes );
        ServerIO.loadTravelTimes.listeners.add( updateTravelTimes );
        ServerIO.loadAlerts.listeners.add( updateAlerts );

        // immediately show old schedule, if we have it
        if ( window.localStorage["cache"] ) {
            ServerIO.loadSchedule( window.localStorage["cache"] );
        }
        if ( window.localStorage["route"] ) {
            route = NextFerry.Route.find( window.localStorage["route"] );
        }

        // ask for new schedule, alerts, etc.
        ServerIO.requestUpdate();

        // one-time rendering for settings page
        settingsRenderOnce();

        // wire up navigation and user actions
        document.addEventListener("backbutton", backPage );
        $("#footer-nav>li").on("click", goDest );
        $("#direction").on("click", doClick( toggleDirection ));
        $("#routes").on("click", gogoPage("#details-page"));
        $("#details-body li").on("click", goDest );
        $("span[type]").on("click", checks );
        $("#reload").on("click", doClick( reset ));
        $("#times").on("touchend", doubleTap );     // detect double tap
        $("#times").on("nf:doubletap", setAlarm );  // do something with it
        $("#setalarm-submit").on("click", doClick( setAlarmSubmit ));
        // dismiss dialogish things by clicking outside the body.
        clickOutside($(".settings-body"), doClick( backPage ));
        clickOutside($("#set-alarm-dialog"), doClick( backPage ));

        // a couple of UI features
        $("#useloc").on("change", updateDisable );
        $("#buftime").rangeslider({
            polyfill: false,
            onSlide: function(pos,val) {
                $("#buftimeval").text( val.toString() );
            }
        });
        $("#setalarm-slider").rangeslider({
            polyfill: false
        });

        // initialize main page scrollers
        ensureScroller("#routes-wrapper", { click: true });
        ensureScroller("#times-wrapper", { scrollX: true, scrollY: false });
        updateScroller("#times-wrapper",500);
        updateScroller("#routes-wrapper",100);

        // done with app construction
        // if test run, divert to test page
        if (testrun) {
            goPage("#test-page");
            nextFerryTests();
            ensureScroller("#qunit-scroll-wrapper");
            updateScroller("#qunit-scroll-wrapper",2000);
        }
    };

    var onPause = function() {
        // save state and turn things off
        NextFerry.synchSettings();
        ServerIO.onPause();
    }

    var onResume = function() {
        ServerIO.onResume();
        ServerIO.requestUpdate(); // for new alerts
        renderTimes();
    }

    var reset = function() {
        NextFerry.reset();
        ServerIO.onResume();
        ServerIO.requestUpdate(); // get alerts and schedule
    };


    var onRotate = function() {
        // update any scrollers on the current page.
        $(currentPage()).find(".scrollwrapper").each( function() {
            updateScroller( "#"+$(this).attr("id"), 200);
        });
    };

    //=======
    // A few rules, to keep code consistent:
    // There are two kinds of code involved in displaying pages:
    // GoPage and its variations, and Renderers.
    // The intent and interaction between them is this:
    //
    // GoPage et al. are used to update page history, show/hide pages,
    // and invoke the proper renderers for a given page.
    // The renderers are responsible for updating the DOM of some page
    // or part of a page.  They may show/hide things _inside_ their
    // jurisdiction, but they do not show/hide themselves.  Renderers
    // are also responsible for their scrollers.
    //
    // GoPage and renderers may all be called "programatically" (i.e.
    // not as event handlers) and should be coded accordingly.
    // They can also be used directly as event handlers for non-user
    // events (e.g. responding to changes, etc.)
    // To use them as event handlers in response to user clicks, they
    // must be wrapped using one of the utility functions (e.g. gogoPage
    // or doClick) that takes care of debouncing.

    //////////////////////////////////////////////////////////////////////////
    //======= Main Page Rendering

    var renderMainPage = function() {
        $("#direction").text(dir);
        renderRoutes();
        renderTimes();
        updateScroller("#routes-wrapper");
    };

    var renderRoutes = function() {
        $("#routes").empty();
        $("#routes").append( NextFerry.Route.displayRoutes().map( function(r) {
            return $( "<li routeid='" + r.code + "'>" +
                "<span class='icon alert' astate='alerts_none'></span>" +
                r.displayName[dir] + "</li>" );
        }));
        updateAlerts();
    };
    var renderTimes = function() {
        var now = NextFerry.NFTime.now();
        NextFerry.Terminal.clearOldTTs();
        // <li routeid='id'><span><span class='time timegoodness'>time</span> <span>...</span></li>
        $("#times").empty();
        $("#times").width(1500); // wider than needed; will be recalculated below.
        $("#times").append( NextFerry.Route.displayRoutes().map( function(r) {
            return $( "<li routeid='" + r.code + "'><span>" + "".concat(
                r.futureDepartures(dir).map( function(tt) {
                    return "<span class='time " + r.tGoodness(dir,tt,now) + "'> " +
                       NextFerry.NFTime.display(tt) +
                       "</span>";
            } )) + "<span></li>");
        }));
        // delay to give the DOM time to render before the following.
        setTimeout( function() {
            fixWidth();
            updateScroller("#times-wrapper");
        }, 200);
        ServerIO.requestTravelTimes();
    };

    var updateTravelTimes = function() {
        // let's just redraw; if there are perf issues we can be cleverer.
        console.log("updating travel times");
        renderTimes();
    };

    var updateAlerts = function() {
        // this is not at all efficient, but it doesn't matter.
        $("#routes>li").each( function() {
            var r = routeOf( $(this) );
            $(this).children("span").attr("astate", r.hasAlerts());
        });;
    };

    // if elem is within one of the route displays (#routes, #times, etc.),
    // returns the route the elem belongs to.
    // otherwise, returns undefined.
    var routeOf = function(elem) {
        if ( !elem.attr("routeid") ) {
            elem = elem.parents("[routeid]");
        }
        return ( elem.length ?
            NextFerry.Route.find( elem.attr("routeid") ) :
            undefined );
    };

    // Calculate native width of text in each list item, and truncate the
    // width of the container to that.  The trick is to (a) have a span inside
    // the <li> that will have a text-width, and (b) init the container-width to
    // wide enough that the spans won't wrap.
    // (Thanks to http://stackoverflow.com/questions/1582534/calculating-text-width-with-jquery
    // for inspiration; this was damned hard to figure out.)
    var fixWidth = function() {
        var max = 0;
        $("#times li>span").each( function() {
            var x = $(this).width();
            if (x > max) { max = x; }
        });
        $("#times").width( max+10 );
    };

    var toggleDirection = function() {
		dir = ( dir === "west" ? "east" : "west" );
        if (dir === "east") {
            $("#main-page").addClass("east");
        }
        else {
            $("#main-page").removeClass("east");
        }
		renderMainPage();
        window.localStorage["dir"] = dir;
    };

    //////////////////////////////////////////////////////////////////////////
    //======= Set Alarm Page
    // double-tapping a departure time brings up a modal dialog

    var setAlarm = function(e) {
        if ($(e.target).hasClass("time")) {
            setAlarmElem = $(e.target);
            setAlarmTerm = routeOf(setAlarmElem).termFrom(dir);
            goPage("#setalarm-page");
        }
    }

    var renderSetAlarmPage = function() {
        // customize the slider to the requested departure time
    }

    var setAlarmSubmit = function() {
        // we only do one alarm at a time, so remove any others that exist
        $(".alarmtime").removeClass(".alarmtime");
        // and add the new one alarm
        setAlarmElem.addClass(".alarmtime");
        // Todo: actually set the alarm...
        backPage();
    }

    //////////////////////////////////////////////////////////////////////////
    //======= Details Page Rendering

    var renderDetailsPage = function(e) {
        if ( e ) {
            // if we got here via main routes list, find the route
            if ( $(e.target).parents("#routes").length ) {
                route = routeOf($(e.target));
                window.localStorage["route"] = route.displayName.west;
            }
            // if we got here via some other means (such as backpage),
            // we should leave route unchanged.
        }
        if ( ! route ) {
            // this can happen if user clicks on "details" icon without
            // ever having visited a route.  and maybe if there are bugs,
            // too.
            route = NextFerry.Route.find("bainbridge");
        }

        $("#details-page [dir=west]").text( route.termFrom("west").name );
        $("#details-page [dir=east]").text( route.termFrom("east").name );
        $("#dn-alerts").attr("astate", route.hasAlerts());
    };

    var renderSchedule = function(e) {
        if (e) {
            var target = $(e.target);
            scheduleDay = target.attr("day");
            scheduleDir = target.attr("dir");
        }

        // render the time table for this date/direction
        $("#sh-dir").text( scheduleDir );
        $("#sh-type").text( scheduleDay );
        $("#sh-termfrom").text( route.termFrom( scheduleDir ).name );
        $("#sh-termto").text( route.termTo( scheduleDir ).name );

        $("#amtimes").html( renderTimeList( route.beforeNoon(scheduleDir, scheduleDay)));
        $("#pmtimes").html( renderTimeList( route.afterNoon(scheduleDir, scheduleDay)));

        ensureScroller("#schedule-body");
        updateScroller("#schedule-body",300);
    };

    var renderTimeList = function(lst) {
        var result = "";
        for (var i in lst) {
            if (i > 0) { result += "<br/>"; }
            result += NextFerry.NFTime.display(lst[i]);
        }
        return result;
    };

    var renderAlerts = function() {
        var alist = NextFerry.Alert.alertsFor( route );

        $("#alerts-list").empty();
		$("#alerts-list").append( alist.map(function(a) {
            return "<li class='alert-item " + (a.unread? "unread" : "read") + "'>" +
                "<span class='posted'>" + a.posted() + "</span><br>" +
                "<span class='alertbody'>" + a.body + "</span></li>";
        }));

        ensureScroller("#alerts-page");
        updateScroller("#alerts-page");

        // after rendering, we can update the "read" attribute for next time.
        route.markAlerts();
    };

    //////////////////////////////////////////////////////////////////////////
    //======= Settings Pages

    var settingsRenderOnce = function() {
        // fill in the route list, which we only need to do once.
        $("#settings-routes-form").append( NextFerry.Route.allRoutes().map(
            function(r) {
                return $( "<span type='checkbox' routeid='" +
                    r.code + "' class='routedisplay'>" +
                    r.displayName.west + "</span><br>");
        }));
    };

    var renderSettingsRoutes = function() {
        // set the check marks
        $(".routedisplay").each( function() {
            var r = routeOf( $(this) );
            $(this).toggleClass("checked", r.isDisplayed());
        });
        ensureScroller("#settings-routes-wrapper",{ click: true });
        updateScroller("#settings-routes-wrapper");
    };

    var renderSettingsOptions = function() {
        var tf = window.localStorage["tf"];
        var bt = window.localStorage["bt"];

        // unset all checkmarks and radio buttons
        $("#settings-options-wrapper span[type]").removeClass("checked");

        // fill in the right values
        $("#" + tf).addClass("checked");    // checks either tf12 or tf24

        if ( window.localStorage["useloc"] === "true" ) {
            $("#useloc").addClass("checked");
        }

        $("#buftime").val( parseInt(bt) ).change();
        $("#buftimeval").text( bt );
        updateDisable();

        ensureScroller("#settings-options-wrapper", { click: true });
        updateScroller("#settings-options-wrapper");
    };

    // Buffer time is only enabled if useloc is on.
    // This is the code that enforces that.
    var updateDisable = function(e) {
        var buftimeEnabled = $("#useloc").hasClass("checked");
        var buftime = $("#buftime");
        if (buftimeEnabled) {
            $("#buftimeitem").removeClass("disabled");
            buftime.prop("disabled", false);
        }
        else {
            $("#buftimeitem").addClass("disabled");
            buftime.prop("disabled", true);
        }
        buftime.rangeslider("update");
        return false;
    };


    var renderSettingsAbout = function() {
        var dt;
        $("#aboutsched").text( window.localStorage["schedulename"] || "unknown" );

        if( window.localStorage["useloc"] !== "true" ) {
            $("#abouttts").text( "Turn 'Use Location' option on to enable travel times.");
        }
        else {
            // Give status of travel times.
            // This is as much for me for debugging as anything else...
            var stat = ServerIO.travelTimeStatus();
            if ( NextFerry.Terminal.hasTTs()) {
                if (stat.lasttt) {
                    dt = new Date(stat.lasttt);
                    $("#abouttts").text("last updated at " + dt.toLocaleTimeString() + ".");
                }
                else {
                    $("#abouttts").text("age unknown.");
                }
            }
            else {
                $("#abouttts").text(stat.status);
            }
        }
        ensureScroller("#settings-about-wrapper");
        updateScroller("#settings-about-wrapper");
    };


    // Exiters

    var saveSettingsRoutes = function() {
        $(".routedisplay").each( function() {
            routeOf($(this)).display( $(this).hasClass("checked") );
        });
        NextFerry.synchSettings();
    };

    var saveSettingsOptions = function() {

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
    };

    //////////////////////////////////////////////////////////////////////////
    //======= History and Page Transitions
    // our history is a little weird: it can only contain any page type once.
    // so if you visit pages in this order:  A, B, C, B the history stack will
    // end up [A, B]  I think this represents what most people usually actually
    // want to do, and it saves us from having to remember instances of pages
    // (per route).

    var _history = [];

    // what to do when visiting a page.
    var renderers = {
        "#main-page" : renderMainPage,
        "#setalarm-page" : renderSetAlarmPage,
        "#details-page" : renderDetailsPage,
        "#schedule-page" : renderSchedule,
        "#alerts-page" : renderAlerts,
        "#settings-routes-page" : renderSettingsRoutes,
        "#settings-options-page" : renderSettingsOptions,
        "#settings-about-page" : renderSettingsAbout
    };
    // what to do when leaving a page
    var exiters = {
        "#settings-routes-page" : saveSettingsRoutes,
        "#settings-options-page" : saveSettingsOptions
    };

    var currentPage = function() {
        return _history[0];
    }

    var leaveCurrentPage = function() {
        if (_history.length > 0) {
            var curr = _history[0];
            exiters[curr] && exiters[curr]();
            $(curr).hide();
        }
    };

    var goPage = function(newpage,e) {
        // take care of page state
        leaveCurrentPage();
        renderers[newpage] && renderers[newpage](e);
        $(newpage).show();

        // take care of history state
        var index = _history.indexOf( newpage );
        if ( index >= 0 ) {
            _history = _history.slice(index);
        }
        else {
            _history.unshift( newpage );
        }
    };


    var backPage = function() {
        leaveCurrentPage();
        if ( _history.length > 1 ) {
            _history.shift();
            var cp = _history[0];
            renderers[cp] && renderers[cp]();
            $(cp).show();
        }
        else {
            // Try to exit app.  NB: we can only get here via the
            // back button, which exists on Android & Windows, but
            // not Apple devices.
            if ( navigator.app ) {
                // Android
                navigator.app.exitApp();
            }
            else if ( device.platform.toLowerCase().startsWith("win") ) {
                // Windows
                // per this thread, we signal the OS to handle the event
                // by throwing an exception:
                // https://issues.apache.org/jira/browse/CB-3621
                throw "please exit the app";
            }
            else {
                console.log("shouldn't get here.  trying to exit app.");
                // instead
                goPage("#main-page");
            }
        }
        return false;
    };

    // helpers
    // produces an event handler to go to a specific page
    var gogoPage = function(p) {
        return function(e) {
            e.preventDefault();
            if ( debounced() ) {
                goPage(p,e);
            }
            return false;
        };
    };

    // go to whatever page is named in the dest attribute
    var goDest = function(e) {
        e.preventDefault();
        if ( debounced() ) {
            var dest = $(e.currentTarget).attr("dest");
            if ( dest ) {
                goPage("#"+dest+"-page", e);
            }
            else {
                console.log("oops: goDest didn't find a target");
                console.log(e);
            }
        }
        return false;
    }

    // define an event handler for clicking outside an element on a page
    // TODO: I think this would behave badly if there were another click handler
    // on the same selector (one would cancel the other?)

    var clickOutside = function(selector,handler) {
        var pageof = selector.parents(".page");
        pageof.on("click", handler );
        selector.on("click", doClick( function() {} ));
    };


    //======= Utilities
    //////////////////////////////////////////////////////////////////////////
    //======= checkboxes and radio boxes
    // Our own implementation of checkboxes and radio boxes,
    // because iScroll has problems with the native implementation, and we wanted
    // to style them ourselves anyway.
    // NB: unbelievable that this is all it takes...

    var checks = function(e) {
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
                    oldval.length > 0 && oldval.removeClass("checked");
                    target.addClass("checked");

                    oldval.length > 0 && oldval.trigger( $.Event("change") );
                    target.trigger( $.Event("change") );
                }
            }
        }
        return false;
    };

    //////////////////////////////////////////////////////////////////////////
    //======= Debouncing
    // Iscroll sometimes sends duplicate click events, so we debounce them.
    // The same debouncing timer is used for all click/tap events, which works
    // fine, assuming that the user cannot intend to issue events
    // faster than every 400 ms (and we aren't worried about detecting things
    // like double-taps, etc.).

    var _debouncing = false;
    var debounced = function() {
        if ( _debouncing ) {
            // console.log("ignored dup event");
            return false;
        }
        else {
            _debouncing = true;
            //console.log("letting event through");
            setTimeout(function() { _debouncing = false; }, 400);
            return true;
        }
    };


    // wrap a function in common event-handling stuff for click events.
    var doClick = function( func ) {
        return function( e ) {
            e.preventDefault();
            if ( debounced() ) {
                func(e);
            }
            return false
        }
    };

    //////////////////////////////////////////////////////////////////////////
    //======= Scrollers
    // We store scrollers in the DOM, on the nodes they operate on.
    // Sometime the creation of scrollers is delayed until they are needed,
    // so the updateScroller function does nothing unless they exist already.
    // Per the IScroll instructions, we always update scrollers asynchronously,
    // which gives the DOM time to "settle".

    var ensureScroller = function(id, options) {
        // make sure there is a scroller for this node
        var s = $(id).data("scroller");
        if ( ! s ) {
            s = new IScroll(id, options);
            $(id).data("scroller", s);
        }
        return s;
    };

    var updateScroller = function(id,delay) {
        // we do not create scrollers here
        var s = $(id).data("scroller");
        if ( s ) {
            setTimeout(function() { s.refresh(); }, delay || 10);
        }
    };

    //////////////////////////////////////////////////////////////////////////
    //======= DoubleTap
    // Quick and dirty implementation of double-tap that is just sufficient
    // for our purposes.
    // If two touch-end events less than 200ms apart on the same target,
    // trigger a double-tap event on that target.
    // Derived from the approach in https://gist.github.com/attenzione/7098476

    var doubleTap = function(e) {
        var targ = $(e.target);
        var lasttouch = targ.data("nextferry:lasttouch");
        var delta = (lasttouch ? (e.timeStamp - lasttouch) : -100);
        console.log(delta);
        if ( delta > 0 && delta < 200 ) {
            targ.data("nextferry:lasttouch",undefined);
            targ.trigger( "nf:doubletap" );
            // no state is copied to event because we don't need it.
        }
        else {
            targ.data("nextferry:lasttouch",e.timeStamp);
        }
    }

    //======= Exports

    var module = {
        init : init,
        // for testing
        reset : reset,
        goPage : goPage
    };

    return module;
}(jQuery));

