/* Main entry point for the NextFerry Application
 * Approximately the View portion from an MVC perspective.
 */

var perftime = Date.now;
var lasttime = perftime();
var mylog = function(a) {
    // newtime = perftime();
    // delta = newtime - lasttime;
    // lasttime = newtime;
    // console.log(a + "(" + delta +")");
    // $("#logspace").append("<p>" + a + "(" + delta + ")</p>");
    console.log(a);
};

var app = (function ($) {
    "use strict";

    var testrun = false; // set to true to run tests, false for normal app.

    //////////////////////////////////////////////////////////////////////////
    //======= App state
    // Parameters that control the generation of pages.
    // main-page: which direction are we showing?
    var dir = window.localStorage["dir"] || "west";

    // detail, schedule, alert pages: which route are we showing?
    var route;

    // schedule page: which direction and day are we showing?
    var scheduleDir;
    var scheduleDay;

    //////////////////////////////////////////////////////////////////////////
    //======= Initialization and event wiring

    var init = function() {
        NextFerry.init();
        $("#title").lettering();
        goPage("#main-page");
        setTimeout(navigator.splashscreen.hide, 100); // gives renderer a chance to finish

        // wire up asynch responses
        document.addEventListener("pause", onPause );
        document.addEventListener("unload", onPause );
        document.addEventListener("resume", onResume );
        document.addEventListener("orientationchange", onRotate );

        // immediately show old schedule, if we have it
        if ( window.localStorage["cache"] ) {
            ServerIO.loadSchedule( window.localStorage["cache"] );
        }
        if ( window.localStorage["route"] ) {
            route = NextFerry.Route.find( window.localStorage["route"] );
        }

        ServerIO.loadSchedule.listeners.add( renderTimes );
        ServerIO.loadTravelTimes.listeners.add( updateTravelTimes );
        ServerIO.loadAlerts.listeners.add( updateAlerts );

        // ask for new schedule, alerts, etc.
        ServerIO.requestUpdate();

        // one-time initialization for settings pages
        // in timeout so as not to delay main page interactivity
        setTimeout(settingsInit, 0);

        // wire up navigation and user actions
        var swipelistener = new Hammer($("body")[0], {
            recognizers: [[Hammer.Swipe,{ direction: Hammer.DIRECTION_RIGHT }]]
        });
        swipelistener.on("swipe", swipeRight );
        // Cordova backbutton handler...
        document.addEventListener("backbutton", backPage);
        // ...isn't working for WP 8.1?
        if (window.WinJS && window.WinJS.Application) {
            window.WinJS.Application.onbackclick = backPage;
        }

        $("#footer-nav>li").onTap( goDest );
        $("#direction").onTap( toggleDirection );
        $("#routes").onTap( gogoPage("#details-page") );
        $("#details-body li").onTap( goDest );
        $("#homepage").onTap( openHomePage );

        // initialize main page scrollers
        ensureScroller("#routes-wrapper", { tap: true });
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
        ServerIO.onPause();
        leaveCurrentPage(true);
    };

    var onResume = function() {
        // Main page is the only page that can need updating purely by the
        // passage of time.  We update it whether it is showing or not.
        mylog("onResume");
        renderMainPage();
        ServerIO.onResume();
        ServerIO.requestUpdate(); // for new alerts
    };

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

    //////////////////////////////////////////////////////////////////////////
    //======= Main Page Rendering

    var renderMainPage = function() {
        //mylog("enter renderMainPage");
        $("#direction").text(dir);
        renderRoutes();
        renderTimes();
        updateScroller("#routes-wrapper");
        //mylog("exit renderMainPage");
    };

    var renderRoutes = function() {
        $("#routes").empty();
        $("#routes").append( NextFerry.Route.displayRoutes().map( function(r) {
            return $( "<li routeid='" + r.code + "'>" +
                "<span class='icon-warning' astate='alerts_none'></span>" +
                r.displayName[dir] + "</li>" );
        }));
        updateAlerts();
    };

    var renderTimes = function() {
        var now = NextFerry.NFTime.now();
        var routes = NextFerry.Route.displayRoutes();

        NextFerry.Terminal.clearOldTTs();
        // <li routeid='id'><span><span class='time timegoodness'>time</span> <span>...</span></li>
        $("#times").empty();
        $("#times").width(1500); // wider than needed; will be recalculated below.
        $("#times").append( routes.map( function(r) {
            var li = $( "<li routeid='" + r.code + "'><span></span></li>");
            // add the contents to the nested span
            li.children().append( r.futureDepartures(dir).map( function(tt) {
                var tspan = $("<span> " + NextFerry.NFTime.display(tt) + "</span>");
                tspan.attr("tGood", r.tGoodness(dir,tt,now));
                tspan.attr("time", tt );
                return tspan;
            }));
            return li;
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
        renderTimes();
    };

    var updateAlerts = function() {
        // this is not at all efficient, but it doesn't matter.
        $("#routes>li").each( function() {
            var r = routeOf( $(this) );
            $(this).children("span").attr("astate", r.hasAlerts());
        });
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

        ensureScroller("#alerts-wrapper");
        updateScroller("#alerts-wrapper");

        // after rendering, we can update the "read" attribute for next time.
        route.markAlerts();
    };

    //////////////////////////////////////////////////////////////////////////
    //======= Settings Pages

    var settingsInit = function() {
        // fill in the route list, which we only need to do once.
        $("#settings-routes-form").append( NextFerry.Route.allRoutes().map(
            function(r) {
                return $( "<span type='checkbox' routeid='" +
                    r.code + "' class='routedisplay'>" +
                    r.displayName.west + "</span><br>" );
        }));

        // create the rangeslider
        $("#buftime").rangeslider({
            polyfill: false,
            onSlide: function(pos,val) {
                $("#buftimeval").text( val.toString() );
            }
        });

        // wire up stuff
        $("#useloc").on("change", updateDisable);
        $("span[type]").onTap( checks );  // all check & radio boxes
        $("#reload").onTap( reset );
    };

    var renderSettingsRoutes = function() {
        // set the check marks
        $(".routedisplay").each( function() {
            var r = routeOf( $(this) );
            $(this).toggleClass("checked", r.isDisplayed());
        });
        ensureScroller("#settings-routes-wrapper", { tap: true });
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

        ensureScroller("#settings-options-wrapper", {tap: true});
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
        ensureScroller("#settings-about-wrapper", {tap: true});
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
        "#details-page" : renderDetailsPage,
        "#schedule-page" : renderSchedule,
        "#alerts-page" : renderAlerts,
        "#settings-routes-page" : renderSettingsRoutes,
        "#settings-options-page" : renderSettingsOptions,
        "#settings-about-page" : renderSettingsAbout,
    };
    // What to do when leaving a page, no matter how the page
    // is left (forward, back, etc.)
    // Generally used to sync in-memory state somewhere.
    var exiters = {
        "#settings-routes-page" : saveSettingsRoutes,
        "#settings-options-page" : saveSettingsOptions,
    };

    var currentPage = function() {
        return _history[0];
    };

    var leaveCurrentPage = function( keep ) {
        if (_history.length > 0) {
            var curr = currentPage();
            exiters[curr] && exiters[curr]();
            if ( ! keep ) {
                $(curr).hide();
            }
        }
    };

    var goPage = function(newpage,e) {
        var currentIsDialog = $(currentPage()).hasClass("dialog");
        var newIsDialog = $(newpage).hasClass("dialog");

        if ( currentIsDialog ) {
            // dialogs are a bit different: they are always dismissed even
            // when moving "forward".  accomplish that by going backwards first.
            backPage();
        }

        // take care of page state
        leaveCurrentPage( newIsDialog );
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
        return false;
    };


    var backPage = function() {
        leaveCurrentPage();
        if ( _history.length > 1 ) {
            _history.shift();
            var cp = _history[0];
            renderers[cp] && renderers[cp]();
            $(cp).show();
            // windows needs this function to return true to indicate the event has been handled
            return true;
        }
        else {
            // Try to exit app.  NB: we can only get here via the
            // back button, which exists on Android & Windows, but
            // not Apple devices.
            if ( navigator.app ) {
                // Android
                navigator.app.exitApp();
            }
            else if ( device.platform.toLowerCase().substr(0,3) == "win" ) {
                // Windows
                // per this thread, we signal the OS to handle the event
                // by throwing an exception:
                // https://issues.apache.org/jira/browse/CB-3621
                throw "please exit the app";
            }
            else {
                mylog("shouldn't get here.  trying to exit app.");
                // instead
                goPage("#main-page");
            }
        }
        return false;
    };

    // swipeRight does a backpage unless we are on the main page, in which case it does nothing.
    var swipeRight = function() {
        if ( currentPage() !== "#main-page" ) {
            backPage();
        }
    }

    // helpers
    // produces an event handler to go to a specific page
    var gogoPage = function(p) {
        return function(e) {
            goPage(p,e);
            return false;
        };
    };

    // go to whatever page is named in the dest attribute
    var goDest = function(e) {
        var dest = $(e.currentTarget).attr("dest");
        if ( dest ) {
            goPage("#"+dest+"-page", e);
        }
        else {
            mylog("oops: goDest didn't find a target");
            console.log(e);
            console.log(this);
        }
        return false;
    };


    var openHomePage = function() {
        mylog("trying to open home page");
        cordova.InAppBrowser.open("http://denised.github.io/nextferry-mobile-client", "_system", "hardwareback=no");
    }

    //======= Utilities
    //////////////////////////////////////////////////////////////////////////
    //======= checkboxes and radio boxes
    // Our own implementation of checkboxes and radio boxes,
    // because iScroll has problems with the native implementation, and we wanted
    // to style them ourselves anyway.
    // NB: unbelievable that this is all it takes...

    var checks = function(e) {
        e.preventDefault();
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
        return false;
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

    //======= Exports

    var module = {
        init : init,
        // for testing
        reset : reset,
        goPage : goPage
    };

    return module;
}(jQuery));

