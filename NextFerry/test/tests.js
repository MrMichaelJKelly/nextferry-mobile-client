function nextFerryTests() {
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
    });

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
	var standardinitmessage =
		"#schedule 2014.07.06\n" +
		schedulefragment +
		"#done";
	var standarddonemessage =
		"#done";
	var specialmessage = "";


	function loadsched() {
		// See the "readable" version in the comment at the bottom of the file
		NextFerry.Route.clearAllTimes();
		app.ServerIO.loadSchedule( schedulefragment );
	}

	QUnit.test( "Test Infrastructure test", function( assert ) {
		var pttownsend = NextFerry.Route.find("pt townsend");
		pttownsend.times.east.weekday = [1, 2, 3, 4];
		pttownsend.times.west.weekday = [5, 6, 7, 8];
		NextFerry.Route.clearAllTimes();
		assert.deepEqual( pttownsend.times.east, {});
		assert.deepEqual( pttownsend.times.west, {});
	});

	QUnit.test( "Schedules can be created", function( assert ) {
		//setup
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
	});


	function mockTime( h, m, dow ) {
		NextFerry.NFDate.getHours = function( d ) { return h; };
		NextFerry.NFDate.getMinutes = function( d ) { return m; };
		NextFerry.NFDate.getDay = function( d ) { return dow; };
		NextFerry.NFDate._tschedt = null;
	}

	QUnit.test( "Time functionality", function( assert ) {
		//setup
		loadsched();
		var oldTimeString = NextFerry.timeString;
		var olddate = NextFerry.NFDate;
		NextFerry.setTimeFormat( true );

		var faunt = NextFerry.Route.find("fauntleroy-southworth");
		var times = faunt.times.west.weekday;

		assert.equal( NextFerry.timeString( times[0] ), "4:25" );
		assert.equal( NextFerry.timeString( times[0] ), "4:25", "caching is okay");
		assert.equal( NextFerry.timeString( times[11] ), "12:20" );
		assert.equal( NextFerry.timeString( times[19] ), "6:30" );
		assert.equal( NextFerry.timeString( times[24] ), "12:55" );
		assert.equal( NextFerry.timeString( times[25] ), "2:10");

		NextFerry.setTimeFormat( false );

		assert.equal( NextFerry.timeString( times[0] ), "04:25" );
		assert.equal( NextFerry.timeString( times[0] ), "04:25", "caching is okay");
		assert.equal( NextFerry.timeString( times[11] ), "12:20" );
		assert.equal( NextFerry.timeString( times[19] ), "18:30" );
		assert.equal( NextFerry.timeString( times[24] ), "00:55" );
		assert.equal( NextFerry.timeString( times[25] ), "02:10");

		mockTime( 10, 10, 0 );
		assert.equal( NextFerry.NFDate.todaysScheduleType(), "weekend" );

		mockTime( 10, 10, 1 );
		assert.equal( NextFerry.NFDate.todaysScheduleType(), "weekday" );

		mockTime( 10, 10, 6 );
		assert.equal( NextFerry.NFDate.todaysScheduleType(), "weekend" );

		//teardown
		NextFerry.Route.clearAllTimes();
		NextFerry.timeString = oldTimeString;
		NextFerry.NFDate = olddate;
	});



	QUnit.test( "Which schedule is it?", function( assert ) {
		//setup
		loadsched();
		var saveNFDate = NextFerry.NFDate;
		var saveformat = NextFerry.timeString;
		NextFerry.setTimeFormat( true );

		var faunt = NextFerry.Route.find("fauntleroy-southworth");
		var pttownsend = NextFerry.Route.find("pt townsend");

		mockTime( 10, 15, 5 );
		assert.equal( faunt.todaysSchedule(), "weekday", "we know what day it is" );

		var times = faunt.futureDepartures( "west" );
		// the next departure after 10:15 is 10:20
		assert.equal( times.length, 18, "we can get times after 10:15" );
		assert.equal( NextFerry.timeString(times[0]), "10:20" );

		times = faunt.beforeNoon( "east", "weekend" );
		assert.equal( times.length, 10, "we can get times before Noon" );
		times = faunt.afterNoon( "east", "weekend" );
		assert.equal( times.length, 15, "we can get times after Noon");
		assert.equal( NextFerry.timeString(times[0]), "12:00", "after Noon includes 12:00");

		// mean, viscious edge-case:  after midnight, before morning cutoff, Monday morning...
		// (the proper schedule is the weekend schedule, with a 2:10 departure)
		mockTime( 1, 30, 1 );
		times = faunt.futureDepartures( "west" );
		assert.equal( times.length, 1, "late sunday night");
		assert.equal( NextFerry.timeString(times[0]), "2:10");

		// when there are no future departures this day?
		mockTime( 15, 0, 3 );
		times = pttownsend.futureDepartures( "east" );
		assert.equal( times.length, 0, "no more departures today");

		//teardown
		NextFerry.Route.clearAllTimes();
		NextFerry.NFDate = saveNFDate;
		NextFerry.timeString = saveformat;
	});

	QUnit.asyncTest( "First Contact", function( assert ) {
		//setup
		NextFerry.Route.clearAllTimes();
		expect(3);

		//test
		app.ServerIO.requestUpdate().always( function(obj,stat,data) {
			assert.equal( stat, "success", "call succeeded");
			var pttownsend = NextFerry.Route.find("pt townsend");
			assert.ok( pttownsend.times.west.weekday, "retrieved a weekday schedule")
			assert.ok( pttownsend.times.west.weekday.length > 0, "and it is non-empty");
			QUnit.start();
		});

		//teardown
		NextFerry.Route.clearAllTimes();
	});
}

//pt townsend,wd, 2:00pm, 2:45pm, 3:30pm, 4:15pm, 6:00pm, 7:30pm, 9:10pm
//pt townsend,we, 7:15am, 8:45am,11:45am,12:30am, 1:15pm, 2:00pm, 2:45pm, 3:30pm, 4:15pm, 5:00pm, 6:00pm, 7:30pm, 9:10pm
//pt townsend,ed, 6:30am, 8:00am, 8:45am, 9:30am,12:30pm, 1:15pm
//pt townsend,ee, 6:30am, 8:00am,11:00am,11:45am,12:30pm, 1:15pm, 4:15pm, 5:15pm, 6:45pm, 8:30pm
//fauntleroy-southworth,wd, 4:25am, 5:15am, 5:50am, 7:05am, 7:45am, 8:45am, 9:05am, 9:25am,10:20am,11:00am,11:40am,12:20pm, 1:40pm, 2:20pm, 3:05pm, 3:35pm, 4:20pm, 5:00pm, 5:40pm, 6:30pm, 7:35pm, 8:55pm,10:20pm,11:40pm,12:55am, 2:10am
//fauntleroy-southworth,we, 5:15am, 6:05am, 6:55am, 7:35am, 8:35am, 9:15am, 9:45am,10:10am,10:45am,11:10am,11:45am,12:20pm, 1:40pm, 2:20pm, 3:00pm, 4:00pm, 4:40pm, 6:20pm, 7:00pm, 7:40pm, 8:30pm,10:20pm,11:40pm,12:55pm, 2:10am
//southworth-fauntleroy,ed, 4:25am, 5:00am, 6:00am, 6:40am, 7:55am, 8:20am, 9:20am, 9:50am,10:10am,11:10am,11:35am,12:30pm, 1:10pm, 2:30pm, 2:55pm, 3:50pm, 4:05pm, 5:05pm, 5:50pm, 6:30pm, 7:20pm, 8:30pm,11:05pm,12:25pm, 1:40am
//southworth-fauntleroy,ee, 4:25am, 6:05am, 6:50am, 7:40am, 8:20am, 9:20am,10:00am,10:20am,10:55am,11:30am,12:00am,12:30pm, 1:10pm, 2:25pm, 3:10pm, 3:50pm, 4:50pm, 5:30pm, 7:10pm, 7:45pm, 8:30pm, 9:15pm,11:05pm,12:25pm, 1:40am
