function nextFerryTests() {

	var schedulefragment =
	"// this is part of a real schedule \n" +
	"// with some times removed to make the lengths different\n" +
	"pt townsend,wd,840,885,930,975,1080,1170,1270\n" +
	"pt townsend,we,435,525,705,750,795,840,885,930,975,1020,1080,1170,1270\n" +
	"pt townsend,ed,390,480,525,570,750,795\n" +
	"pt townsend,ee,390,480,660,705,750,795,975,1035,1125,1230\n" +
	"fauntleroy-southworth,wd,265,315,350,425,465,525,545,565,620,660,700,740,820,860,905,935,980,1020,1060,1110,1175,1255,1340,1420,1495,1570\n" +
	"fauntleroy-southworth,we,315,365,415,455,515,555,585,610,645,670,705,740,820,860,900,960,1000,1100,1140,1180,1230,1340,1420,1495,1570\n" +
	"southworth-fauntleroy,ed,265,300,360,400,475,500,560,590,610,670,695,750,790,870,895,950,965,1025,1070,1110,1160,1230,1385,1465,1540\n" +
	"southworth-fauntleroy,ee,265,365,410,460,500,560,600,620,655,690,720,750,790,865,910,950,1010,1050,1150,1185,1230,1275,1385,1465,1540\n";
	// translated into human-readable times, this is what the schedule is:
  //pt townsend,wd, 2:00pm, 2:45pm, 3:30pm, 4:15pm, 6:00pm, 7:30pm, 9:10pm
  //pt townsend,we, 7:15am, 8:45am,11:45am,12:30am, 1:15pm, 2:00pm, 2:45pm, 3:30pm, 4:15pm, 5:00pm, 6:00pm, 7:30pm, 9:10pm
  //pt townsend,ed, 6:30am, 8:00am, 8:45am, 9:30am,12:30pm, 1:15pm
  //pt townsend,ee, 6:30am, 8:00am,11:00am,11:45am,12:30pm, 1:15pm, 4:15pm, 5:15pm, 6:45pm, 8:30pm
  //fauntleroy-southworth,wd, 4:25am, 5:15am, 5:50am, 7:05am, 7:45am, 8:45am, 9:05am, 9:25am,10:20am,11:00am,11:40am,12:20pm, 1:40pm, 2:20pm, 3:05pm, 3:35pm, 4:20pm, 5:00pm, 5:40pm, 6:30pm, 7:35pm, 8:55pm,10:20pm,11:40pm,12:55am, 2:10am
  //fauntleroy-southworth,we, 5:15am, 6:05am, 6:55am, 7:35am, 8:35am, 9:15am, 9:45am,10:10am,10:45am,11:10am,11:45am,12:20pm, 1:40pm, 2:20pm, 3:00pm, 4:00pm, 4:40pm, 6:20pm, 7:00pm, 7:40pm, 8:30pm,10:20pm,11:40pm,12:55pm, 2:10am
  //southworth-fauntleroy,ed, 4:25am, 5:00am, 6:00am, 6:40am, 7:55am, 8:20am, 9:20am, 9:50am,10:10am,11:10am,11:35am,12:30pm, 1:10pm, 2:30pm, 2:55pm, 3:50pm, 4:05pm, 5:05pm, 5:50pm, 6:30pm, 7:20pm, 8:30pm,11:05pm,12:25pm, 1:40am
  //southworth-fauntleroy,ee, 4:25am, 6:05am, 6:50am, 7:40am, 8:20am, 9:20am,10:00am,10:20am,10:55am,11:30am,12:00am,12:30pm, 1:10pm, 2:25pm, 3:10pm, 3:50pm, 4:50pm, 5:30pm, 7:10pm, 7:45pm, 8:30pm, 9:15pm,11:05pm,12:25pm, 1:40am

	function loadsched() {
		// See the "readable" version in the comment at the bottom of the file
		NextFerry.Route.clearAllTimes();
		ServerIO.loadSchedule( schedulefragment );
	}

	// remove changes to localStorage.
	var _store;
	function copyLS() {
		_store = JSON.stringify( window.localStorage );
	}
	function restoreLS() {
		// just copying over window.localStorage seems like a bad idea.
		// after all, window.localStorage is a special kind of object.
		// so restore the properties, one by one.
		var restore = JSON.parse( _store );
		for ( i in restore ) {
			window.localStorage[i] = restore[i];
		}
		// and get rid of any that were added.
		for ( i in window.localStorage ) {
			if ( ! (i in restore) ) {
				delete window.localStorage[i];
			}
		}
	}

	// begin tests.

	QUnit.test( "Test Infrastructure test", function( assert ) {
		window.localStorage["zzqq"] = 1;
		copyLS();

		// test clearAllTimes
		var pttownsend = NextFerry.Route.find("pt townsend");
		pttownsend.times.east.weekday = [1, 2, 3, 4];
		pttownsend.times.west.weekday = [5, 6, 7, 8];
		NextFerry.Route.clearAllTimes();
		assert.deepEqual( pttownsend.times.east, {});
		assert.deepEqual( pttownsend.times.west, {});

		// test restoring localStorage
		assert.ok( ! ("zzy" in window.localStorage) );
		assert.ok( "zzqq" in window.localStorage );
		window.localStorage["zzqq"] = 20;
		window.localStorage["zzy"] = "bar";
		restoreLS();
		assert.equal( window.localStorage["zzqq"], 1, "restoring localStorage works");
		assert.ok( ! ("zzy" in window.localStorage), "and it gets rid of added properties" );
		delete window.localStorage["zzqq"];
	});

  QUnit.asyncTest( "Test infrastructure: location spoofing", function( assert ) {
  	// all this complexity is so that we can chain the tests properly, and
  	// keep that mechanism separate from the content of the tests themselves.
  	var expected = function(expectedTest) {
			return function(val) {
				assert.ok( true, "the right callback was called" );
				expectedTest(val);
				tests.length > 0 && tests.shift()(); // that's pop the array, and call it.
			};
		};
		var notExpected = function() {
			assert.ok( false, "the wrong callback was called" );
			tests.length > 0 && tests.shift()();
		}
  	var tests = [
  		function() {
				getAccuratePosition.spoof_value = "hello, there!";
				getAccuratePosition(
					expected(function(v) { assert.equal(v,"hello, there!") }),
					notExpected);
  		},
  		function() {
  			getAccuratePosition.spoof_value = undefined;
  			getAccuratePosition(
  				expected(function(v) { assert.notEqual(v,"hello, there!"); }),
  				expected(function() { assert.ok( true, "any error possible"); }));
  		},
  		function() {
  			getAccuratePosition.spoof_error = "oops!";
  			getAccuratePosition(
  				notExpected,
  				expected(function(v) { assert.equal(v,"oops!"); }));
  		},
  		function() {
  			getAccuratePosition.spoof_error = "undefined";
  			getAccuratePosition(
  				expected(function() { assert.ok(true, "any return value possible");}),
  				expected(function(v) { assert.notEqual(v,"oops!"); }));
  		},
  		function() {
  			QUnit.start();
  		}
  	];

		expect(8);
		tests.shift()();
	});

	QUnit.test( "Routes exist", function( assert ) {
		assert.equal( NextFerry.Route.allRoutes().length, 11, "There are 11 routes" );
		assert.equal( NextFerry.Route.allRoutes()[3].displayName["west"], "pt townsend",
			"At least one route has a correct name" );
		assert.equal( NextFerry.Route.allRoutes()[5].displayName["east"], "vashon-fauntleroy",
			"At least one route has its name in the correct direction");
		assert.equal(
			NextFerry.Terminal.allTerminals()[ NextFerry.Route.allRoutes()[5].terminals["west"] ].name, "Vashon Island",
			"At least one route is hooked properly to it's terminal");
		assert.equal( NextFerry.Route.find("edmonds").terminals["west"], 12, "Route.find can find");
		assert.equal( NextFerry.Route.find("fauntleroy-vashon").code,
			NextFerry.Route.find("vashon-fauntleroy").code,
			"... in either direction");
		assert.equal( NextFerry.Route.find(1<<8).code, 1<<8, "lookup by code works too");
	});

	QUnit.test( "Schedules can be created", function( assert ) {
		//setup
		copyLS();
		loadsched();

		//test
		var pttownsend = NextFerry.Route.find("pt townsend");
		assert.equal( pttownsend.times.west.weekend.length, 13, "We have a schedule" );
		assert.equal( pttownsend.times.west.weekday.length, 7 );
		assert.equal( pttownsend.times.east.weekend.length, 10 );
		assert.equal( pttownsend.times.east.weekday.length, 6 );
		assert.ok( NextFerry.Route.find("fauntleroy-southworth").times.east.weekday, "Not confused by direction");

		var times = pttownsend.times.west.weekend;
		assert.equal( times[0], 435 );
		assert.equal( times[12], 1270 );

		//teardown
		NextFerry.Route.clearAllTimes();
		restoreLS();
	});

	QUnit.test( "Time functionality", function( assert ) {
		copyLS();
		loadsched();

		var faunt = NextFerry.Route.find("fauntleroy-southworth");
		var times = faunt.times.west.weekday;

		NextFerry.NFTime.setDisplayFormat( "tf12" );

		assert.equal( NextFerry.NFTime.display( times[0] ), "4:25" );
		assert.equal( NextFerry.NFTime.display( times[0] ), "4:25", "caching is okay");
		assert.equal( NextFerry.NFTime.display( times[11] ), "12:20" );
		assert.equal( NextFerry.NFTime.display( times[19] ), "6:30" );
		assert.equal( NextFerry.NFTime.display( times[24] ), "12:55" );
		assert.equal( NextFerry.NFTime.display( times[25] ), "2:10");

		NextFerry.NFTime.setDisplayFormat( "tf24" );

		assert.equal( NextFerry.NFTime.display( times[0] ), "04:25" );
		assert.equal( NextFerry.NFTime.display( times[0] ), "04:25", "caching is okay");
		assert.equal( NextFerry.NFTime.display( times[11] ), "12:20" );
		assert.equal( NextFerry.NFTime.display( times[19] ), "18:30" );
		assert.equal( NextFerry.NFTime.display( times[24] ), "00:55" );
		assert.equal( NextFerry.NFTime.display( times[25] ), "02:10");


		NextFerry.NFTime.spoofOn( 10, 10, 0 );
		assert.equal( NextFerry.todaysScheduleType(), "weekend" );

		NextFerry.NFTime.spoofOn( 10, 10, 1 );
		assert.equal( NextFerry.todaysScheduleType(), "weekday" );

		NextFerry.NFTime.spoofOn( 10, 10, 6 );
		assert.equal( NextFerry.todaysScheduleType(), "weekend" );

		//teardown
		NextFerry.Route.clearAllTimes();
		NextFerry.NFTime.spoofOff();
		restoreLS();
	});

	QUnit.test( "Which schedule is it?", function( assert ) {
		//setup
		copyLS();
		loadsched();
		NextFerry.NFTime.setDisplayFormat( "tf12" );

		var faunt = NextFerry.Route.find("fauntleroy-southworth");
		var pttownsend = NextFerry.Route.find("pt townsend");

		NextFerry.NFTime.spoofOn( 10, 15, 5 );
		assert.equal( faunt.todaysSchedule(), "weekday", "we know what day it is" );

		var times = faunt.futureDepartures( "west" );
		// the next departure after 10:15 is 10:20
		assert.equal( times.length, 18, "we can get times after 10:15" );
		assert.equal( NextFerry.NFTime.display(times[0]), "10:20" );

		times = faunt.beforeNoon( "east", "weekend" );
		assert.equal( times.length, 10, "we can get times before Noon" );
		times = faunt.afterNoon( "east", "weekend" );
		assert.equal( times.length, 15, "we can get times after Noon");
		assert.equal( NextFerry.NFTime.display(times[0]), "12:00", "after Noon includes 12:00");

		// mean, viscious edge-case:  after midnight, before morning cutoff, Monday morning...
		// (the proper schedule is the weekend schedule, with a 2:10 departure)
		NextFerry.NFTime.spoofOn( 1, 30, 1 );
		times = faunt.futureDepartures( "west" );
		assert.equal( times.length, 1, "late sunday night");
		assert.equal( NextFerry.NFTime.display(times[0]), "2:10");

		// when there are no future departures this day?
		NextFerry.NFTime.spoofOn( 15, 0, 3 );
		times = pttownsend.futureDepartures( "east" );
		assert.equal( times.length, 0, "no more departures today");

		//teardown
		NextFerry.Route.clearAllTimes();
		NextFerry.NFTime.spoofOff();
		restoreLS();
	});

  var travelTimes = "17:10\n20:20";  // 10 minutes to pt townsend, 20 minutes to southworth
  QUnit.test( "Time Goodness", function( assert ) {
		//setup
		copyLS();
		loadsched();
		NextFerry.Terminal.loadTTs(travelTimes);

		assert.equal(NextFerry.Terminal.find(17).tt, 10, "setting tt worked");
		assert.equal(NextFerry.Terminal.find(20).tt, 20 );
		assert.equal(NextFerry.Terminal.find(7).tt, false, "not setting tt worked too");

    // If we don't know the travel time, we can't estimate goodness
    // If we do know the travel time, our expected arrival is now + travel time,
    // to which we add buffer time to account for variability in travel time, desire to arrive early, ...
    //
    // If our expected arrival time is:
    //     after departure (with a fudge factor), it is too late
    //     less than buffer time before departure, it is risky
    //     otherwise okay.

    var faunt = NextFerry.Route.find("fauntleroy-southworth"); // 20 minutes to southworth
    var departure = 1500;

    // buffer = zero.
    window.localStorage["bt"] = 0;
    NextFerry.synchSettings();
    assert.equal( faunt.tGoodness("west", departure, departure), "Unknown", "We don't know tt for west terminal" );
    assert.equal( faunt.tGoodness("east", departure, departure+10), "TooLate", "It already left");
    assert.equal( faunt.tGoodness("east", departure, departure-10), "TooLate", "We can't get there in time");
    assert.equal( faunt.tGoodness("east", departure, departure-19), "Risky", "Maybe if we're lucky");
    assert.equal( faunt.tGoodness("east", departure, departure-20), "Risky", "If all goes perfectly");
    assert.equal( faunt.tGoodness("east", departure, departure-100), "Good", "80 minutes to spare is plenty good" );
    assert.equal( faunt.tGoodness("east", departure, departure-300), "Indifferent", "yeah, whatever" );

    // buffer = one hour
    window.localStorage["bt"] = 60;
    NextFerry.synchSettings();
    assert.equal( faunt.tGoodness("east", departure, departure-20), "Risky", "still risky to arrive exactly at departure");
    assert.equal( faunt.tGoodness("east", departure, departure-60), "Risky", "we have less than an hour buffer");
    assert.equal( faunt.tGoodness("east", departure, departure-140), "Good", "travel time and buffer time both satisfied");
    assert.equal( faunt.tGoodness("east", departure, departure-300), "Indifferent", "still indifferent");

    //teardown
    NextFerry.Route.clearAllTimes();
    NextFerry.Terminal.clearTTs();
    restoreLS();
    NextFerry.synchSettings();
	});

	QUnit.test("Route display", function(assert) {
		copyLS();
		window.localStorage["dl"] = "";
		// initial display list
		NextFerry.init();
		var pt = NextFerry.Route.find("pt townsend");
		var other = NextFerry.Route.find("edmonds");
		var dl = NextFerry.Route.displayRoutes();
		assert.equal( dl.length, 11, "initially all routes are displayed");
		assert.ok( dl.indexOf( pt ) > -1, "including pt townsend");
		assert.ok( pt.isDisplayed(), "route display property works");

		// as shown on app page.
		app.renderSettingsPage();
		assert.equal( $(".routedisplay").length, 11, "showing all routes");
		assert.ok( $("#r16").prop( "checked" ), "initially is checked");

		// set pt townsend to false
		$("#r16").prop( "checked", false );
		assert.ok( ! $("#r16").prop( "checked "), "check is removed" );
		app.saveSettings();

		// is it correctly reflected in internal state?
		dl = NextFerry.Route.displayRoutes();
		assert.equal( dl.length, 10, "one less route to display" );
		assert.equal( dl.indexOf(pt), -1, "pt townsend has been removed");
		assert.ok( dl.indexOf( other ) > -1, "but others still there");
		var ls = JSON.parse( window.localStorage["dl"] );
		assert.ok( ! (1<<4 in ls), "reflected in LS");
		assert.ok( other.isDisplayed() );
		assert.ok( ! pt.isDisplayed() );

		// and is it remembered next time we generate the settings page?
		app.renderSettingsPage();
		assert.equal( $(".routedisplay").length, 11, "length doesn't change");
		assert.ok( ! $("#r16").prop("checked"), "r16 is not checked");
		assert.ok( $("#r32").prop("checked"), "but other things are");

		// what about next time we init (re-initialize from LS)
		NextFerry.init();
		pt = NextFerry.Route.find("pt townsend");  // don't really have to re-assign, but being paranoid...
		other = NextFerry.Route.find("edmonds");
		assert.ok( other.isDisplayed() );
		assert.ok( ! pt.isDisplayed() );

		restoreLS();
		NextFerry.init(); // make internal state match
	});

	// Alerts

	var alert1 = "__ 00:45:53.308110 224\n" +
	"This is an alert for the Vashon ferries.  Some message here.\n" +
	"__\n";
	var alert3 = "__ 00:45:53.308110 224\n" +
	"This is an alert for the Vashon ferries.  Some message here.\n" +
	"__ 01:45:53.000000 224\n" +
	"Another alert for the Vashon ferries.\n" +
	"__ 02:45:53.000000 4\n" +
	"And this is an alert for Edmonds\n"
	"__";

	QUnit.test("Loading an Alert", function(assert) {
		copyLS();
		window.localStorage["rl"] = "";
		NextFerry.init();
		expect(5);

		NextFerry.Alert.loadAlerts(alert1);
		var alerts = NextFerry.Alert.allAlerts();
		assert.equal( alerts.length, 1, "We can load a single alert" );
		var a = alerts[0];
		assert.equal( a.id, "00:45:53.308110", "With id..." );
		assert.equal( a.codes, 224, "Codes..." );
		assert.equal( a.unread, true, "Read status...");
		assert.equal( a.body, "This is an alert for the Vashon ferries.  Some message here.\n", "and body.");
		restoreLS();
	});

	QUnit.test("Working with Alerts", function(assert) {
		copyLS();
		window.localStorage["rl"] = "";
		NextFerry.init();
		expect(10);

		NextFerry.Alert.loadAlerts(alert3);
		assert.equal( NextFerry.Alert.allAlerts().length, 3, "Loading multiple alerts" );

		var r = NextFerry.Route.find("fauntleroy-vashon");
		assert.equal( NextFerry.Alert.hasAlerts(r), true, "checking when alerts present" );
		assert.equal( NextFerry.Alert.hasAlerts(r,true), true, "...okay for unread alerts" );
		var alerts = NextFerry.Alert.alertsFor(r);
		assert.equal( alerts.length, 2, "Retrieval works" );
		assert.equal( NextFerry.Alert.alertsFor("vashon-southworth").length, 2, "via another route");
		assert.equal( NextFerry.Alert.alertsFor("bremerton").length, 0, "empty lookup works");
		assert.equal( NextFerry.Alert.hasAlerts("bremerton"), false, "either way you do it" );
		assert.equal( NextFerry.Alert.hasAlerts("edmonds"), true, "edmonds alert" );
		alerts = NextFerry.Alert.alertsFor("edmonds");
		assert.equal( alerts.length, 1, "we can retrieve it" );
		assert.equal( alerts[0].body, "And this is an alert for Edmonds\n", "and it has the right body" );

		restoreLS();
	});


  // Asynch network tests goes last.
  // We don't clean up state from this one, but all that will happen is that
  // a new schedule will be loaded.
  // Don't add any other state changes!

  QUnit.asyncTest( "First Contact", function( assert ) {
		//setup
		NextFerry.Route.clearAllTimes();
		window.localStorage["cachedate"] = "";
		expect(3);

		//test
		ServerIO.requestUpdate().always( function(obj,stat,data) {
			assert.equal( stat, "success", "call succeeded");
			var pttownsend = NextFerry.Route.find("pt townsend");
			assert.ok( pttownsend.times.west.weekday, "retrieved a weekday schedule")
			assert.ok( pttownsend.times.west.weekday.length > 0, "and it is non-empty");
			QUnit.start();
		});
	});
}
