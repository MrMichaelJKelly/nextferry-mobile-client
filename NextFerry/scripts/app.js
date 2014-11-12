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

    //======= Initialization and event wiring

    var init = function() {
        NextFerry.init();
        $("#title").lettering();
        goPage("#main-page");

        // wire up asynch responses
        document.addEventListener("pause", onPause );
        document.addEventListener("unload", onPause );
        document.addEventListener("resume", onResume );
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
        $("#useloc").on("change", updateDisable );

        // on settings pages, go back if clicked outside of settings body
        $(".settings-style").on( "click", doClick( noop ));
        $(".settings-page").on( "click", doClick( backPage ));

        $("#buftime").rangeslider({
            polyfill: false,
            onSlide: function(pos,val) {
                $("#buftimeval").text( val.toString() );
            }
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
        renderTimes();
    }

    var reset = function() {
        NextFerry.reset();
        ServerIO.onResume();
        ServerIO.requestUpdate();
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
            return $( "<li id='rr" + r.code + "'>" +
                "<span class='icon alert' astate='alerts_none'></span>" +
                r.displayName[dir] + "</li>" );
        }));
        updateAlerts();
    };
    var renderTimes = function() {
        var now = NextFerry.NFTime.now();
        NextFerry.Terminal.clearOldTTs();
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
        updateScroller("#times-wrapper",100);
        ServerIO.requestTravelTimes();
    };

    var updateTravelTimes = function() {
        // let's just redraw; if there are perf issues we can be cleverer.
        console.log("updating travel times");
        renderTimes();
    };

    var updateAlerts = function() {
        // this is not at all efficient, but it doesn't matter.
        $("#routes>li").each( function(i,e) {
            var route = NextFerry.Route.find( $(e).prop("id").substr(2) );
            $(e).children("span").attr("astate", route.hasAlerts());
        });;
    };

    // Calculate native width of text in each list item, and truncate the
    // width of the container to that.  The trick is to (a) have a span inside
    // the <li> that will have a text-width, and (b) init the container-width to
    // wide enough that the spans won't wrap.
    // (Thanks to http://stackoverflow.com/questions/1582534/calculating-text-width-with-jquery
    // for inspiration; this was damned hard to figure out.)
    var fixWidth = function( ) {
        var max = 0;
        $("#times li>span").each( function(i,e) {
            var x = $(e).width();
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

    //======= Details Page Rendering

    var renderDetailsPage = function(e) {
        if ( e ) {
            // if we got here via main routes list, the text of the target
            // will be the name of the route.  (Have to check both this
            // element and parent in case user clicked on an icon.)
            var routename = e.target.innerText || e.target.parentElement.innerText;
            routename = routename.trim();
            var newroute = NextFerry.Route.find(routename);
            if (newroute) {
                route = newroute;
                window.localStorage["route"] = route.displayName.west;
            }
            // if we got here via some other means, there won't have been
            // a routename, and hence newroute will be undefined.
            // In that case we should stick with the previous route.
        }
        if ( ! route ) {
            // this can happen if user clicks on "details" icon without
            // ever having visited a route.  and maybe if there are bugs,
            // too.
            route = NextFerry.Route.find("bainbridge");
        }

        $("#details-page [dir=west]").text( route.termFromName("west") );
        $("#details-page [dir=east]").text( route.termFromName("east") );
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
        $("#sh-termfrom").text( route.termFromName( scheduleDir ));
        $("#sh-termto").text( route.termToName( scheduleDir ));

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




    //======= Settings Pages

    var settingsRenderOnce = function() {
        // fill in the route list, which we only need to do once.
        $("#settings-routes-form").append( NextFerry.Route.allRoutes().map(
            function(r) {
                var id = "r" + r.code;
                return $( "<span type='checkbox' id='" +
                    id + "' class='routedisplay'>" +
                    r.displayName.west + "</span><br>");
        }));
    };

    var renderSettingsRoutes = function() {
        // unset all checkmarks
        $("#settings-routes-form span[type]").removeClass("checked");
        // set checks on the displayed routes
        NextFerry.Route.displayRoutes().map(
            function(r) {
                $("#r" + r.code).addClass("checked");
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
            var code = $(this).prop("id").substr(1);
            NextFerry.Route.find(code).display( $(this).hasClass("checked") );
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

    //======= Utilities

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
        "#settings-about-page" : renderSettingsAbout
    };
    // what to do when leaving a page
    var exiters = {
        "#settings-routes-page" : saveSettingsRoutes,
        "#settings-options-page" : saveSettingsOptions
    };

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

    var noop = function() { };

    //======= Exports

    var module = {
        init : init,
        // for testing
        reset : reset,
        goPage : goPage
    };

    return module;
}(jQuery));
