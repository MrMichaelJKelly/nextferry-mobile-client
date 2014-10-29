/* Main entry point for the NextFerry Application
 * Approximately the View portion from an MVC perspective.
 */

var app = (function ($) {
    var dir = window.localStorage["dir"] || "west";
    var testrun = false;

    var mainScroll;
    var timeScroll;
    var schedScroll;
    var alertScroll;

    //======= Initialization and event wiring

    var init = function() {
        NextFerry.init();
        $("#title").lettering();

        // wire up asynch responses
        ServerIO.loadSchedule.listeners.add(renderTimes);
        ServerIO.loadTravelTimes.listeners.add(updateTravelTimes);
        ServerIO.loadAlerts.listeners.add(updateAlerts);

        // immediately show old schedule, if we have it
        if ( window.localStorage["cache"] ) {
            ServerIO.loadSchedule( window.localStorage["cache"] );
        }
        goPage("#main-page");

        // ask for new schedule, alerts, etc.
        ServerIO.requestUpdate();

        // one-time rendering for settings page
        settingsRenderOnce();

        // wire up all the event actions
        $("#direction").on("click", toggleDirection);
        $("#routes").on("click", gogoPage("#details-page"));
        $("#details-nav li").on("click", detailsNav);
        $("#details-header").on("click", detailsNav);
        $("#details-exit").on("click",backPage);
        $("#settings-nav>li").on("click", settingsNav);
        $(".settings-exit").on("click", settingsExit);
        $("span[type]").on("click", settingsClicks);
        $("#useloc").on("change",updateDisable);
        $("#reload").on("click",reset);

        $("#buftime").rangeslider({
            polyfill: false,
            onSlide: function(pos,val) {
                $("#buftimeval").text( val.toString() );
            }
        });

        // initialize main page scrollers
        mainScroll = new IScroll("#outerwrap", { click: true });
        timeScroll = new IScroll("#timeswrap", { scrollX: true, scrollY: false });
        // asynch update allows scrollers to re-check after page rendering is done.
        updateScroller(timeScroll,500);
        updateScroller(mainScroll,100);

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
        updateScroller(timeScroll,100);
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
        });
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
        window.localStorage["dir"] = dir;
        return false;
    };

    //======= Details Page Rendering
    // information about the curent route whose details we are viewing
    var _routename;
    var _r;
    var _alertsStatus;

    var renderDetailsPage = function(e) {
        e && e.preventDefault();
        if ( e == undefined || debounced() ) {
            if ( e ) {
                _routename = e.target.innerText || e.target.parentElement.innerText;
                _routename = _routename.trim();
                _r = NextFerry.Route.find(_routename);
                _alertStatus = _r.hasAlerts();

                $("#details-nav [dir=west]").text( _r.termFromName("west") );
                $("#details-nav [dir=east]").text( _r.termFromName("east") );
            }
            if ( ! _routename ) {
                alert("error! called DetailsPage without route! (bug in code, please report)");
                backPage();
            }

            _alertStatus = _r.hasAlerts();
            $("#dn-alerts").attr("astate", _alertStatus);

            // render and show the nav
            $(".details-part").hide();
            $("#details-nav").show();
        }
    };


    // manage navigation within details page
    var detailsNav = function(e) {
        e.preventDefault();
        if ( debounced() ) {
            var target = $(e.target);

            if ( target.prop("id") === "details-header") {
                renderDetailsPage();  // re-display nav page
            }
            else if ( target.prop("id") === "dn-alerts") {
                renderAlerts();
            }
            else {
                renderSchedule( target.attr("dir"), target.attr("day") );
            }
        }
        return false;
    };

    var renderSchedule = function(dir, day) {
        // render the time table for this date/direction
        $("#sh-dir").text( dir );
        $("#sh-type").text( day );
        $("#sh-termfrom").text( _r.termFromName(dir) );
        $("#sh-termto").text( _r.termToName(dir) );

        $("#amtimes").html( renderTimeList( _r.beforeNoon(dir, day) ));
        $("#pmtimes").html( renderTimeList( _r.afterNoon(dir, day) ));

        $(".details-part").hide();
        $("#schedule").show();

        schedScroll = (schedScroll || new IScroll("#schedule-body"));
        updateScroller(schedScroll,300);
    };

    var renderTimeList = function(lst) {
        var result = "";
        for (var i in lst) {
            if (i > 0) { result += "<br/>"; }
            result += NextFerry.NFTime.display(lst[i]);
        }
        return result;
    };

    var renderAlerts = function(name) {
        var alist = NextFerry.Alert.alertsFor(_r);

        $("#alerts-list").empty();
		$("#alerts-list").append( alist.map(function(a) {
            return "<li class='alert " + (a.unread? "unread" : "read") + "'>" +
                "<span class='posted'>" + a.posted() + "</span><br>" +
                "<span class='alertbody'>" + a.body + "</span></li>";
        }));

        $(".details-part").hide();
        $("#alerts").show();
        alertScroll = (alertScroll || new IScroll("#alerts"));
        updateScroller(alertScroll);

        // after rendering, we can update the "read" attribute for next time.
        _r.markAlerts();
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
    var settingsClicks = function(e) {
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
    // The same debouncing timer is used for all click/tap events, which works
    // fine, assuming that the user cannot intend to issue events
    // faster than every 400 ms (and we don't have double-taps to worry about).
    // In any case where there would be *intentional* chaining of events,
    // use clear_debounce to pave the way.
    var debouncing_on = false;
    var debounced = function() {
        if ( debouncing_on ) {
            // console.log("ignored dup event");
            return false;
        }
        else {
            debouncing_on = true;
            //console.log("letting event through");
            setTimeout(function() { debouncing_on = false; }, 400);
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
        "#details-page" : renderDetailsPage,
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
