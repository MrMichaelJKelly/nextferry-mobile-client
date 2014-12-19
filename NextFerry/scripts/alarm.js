/*
 * Encapsulate our functionality for managing a local notification alarm
 * on a particular ferry departure.
 * Uses NextFerry, but no other
*/

var Alarm = (function($) {

	// Our internal state
	var currentAlarm = {};			// if non-empty, this alarm has been set
	var potentialAlarm = undefined;	// this is an alarm that may be set,
									// replacing the current alarm.
									// undefined if we aren't working on one now.
	// a note on time formats:
	// ferryTime and leaveByTime are in NFTime format (and date=today is implicit)
	// asMillis is the full time of scheduled notification, including date.

	var listeners = $.Callbacks();	// notification when alarm goes off
	var timerID;	// ID of the setTimeout timer to actually trigger the alarm.

	var init = function() {
		currentAlarm = {};
		potentialAlarm = undefined;

		if ( window.localStorage["alarm"] ) {
			currentAlarm = inflateAlarm(JSON.parse(window.localStorage["alarm"]));
		}
		setNotifications();
	};

	var inflateAlarm = function(al) {
		// take a proto alarm and fill in missing bits
		var newal = al;
		newal.route = NextFerry.Route.find(newal.routeId);
		newal.term = newal.route.termFrom(newal.dir);
		newal.isSet = al.isSet || false;
		return newal;
	};

	var deflateAlarm = function(al) {
		// take an alarm and remove all but the essential bits
		var newal = {
			routeId: al.routeId,
			dir: al.dir,
			ferryTime: al.ferryTime,
			isSet: (al.isSet || false)
		};
		if ( newal.isSet ) {
			newal.leaveByTime = al.leaveByTime;
			newal.asMillis = al.asMillis;
		}
		return newal;
	};

	var alEqual = function(al1, al2) {
		// return true if the alarms are for the same departure
		return ( al1.routeId === al2.routeId &&
				 al1.dir === al2.dir &&
				 al1.ferryTime === al2.ferryTime );
	};

	var leaveByTime = function(al) {
		// If we have an established leaveby time, use that.
		// otherwise define a default leaveby time:
		// leave with a proper buffer time, or 60 minutes if we don't know
		if ( ! al.leaveByTime ) {
			var buffer = ( al.term.tt ?
							al.term.tt + parseInt(window.localStorage["bt"])
							: 60 );
			al.leaveByTime = al.ferryTime - buffer;

			// but not earlier than it is now.
			if ( al.leaveByTime < NextFerry.NFTime.now() ) {
				al.leaveByTime = NextFerry.NFTime.now();
			}
		}
		return al.leaveByTime;
	};

	var goodness = function(al, t) {
		return (al.term ? al.term.tGoodness(al.ferryTime-t) : "Unknown");
	};

	var configure = function(rid,dir,ferry) {
		// set up potentialAlarm to work with
		var proto = {
			routeId: rid,
			dir: dir,
			ferryTime: ferry
		};
		if ( alEqual(proto,currentAlarm) ) {
			reopen();
		}
		else {
			potentialAlarm = inflateAlarm(proto);
		}
	};

	var reopen = function() {
		// create a copy of the existing alarm, so that we can edit it.
		// (there should be an existing alarm if this is called, if not
		// we put in some default values)
		if ( currentAlarm != {} ) {
			potentialAlarm = currentAlarm;
		}
		else {
			console.log("BUG: shouldn't get here.  faking an entry.");
			potentialAlarm = inflateAlarm({routeId: 1, dir: "west", ferryTime: 1234});
		}
	}

	var confirm = function(t) {
		var leaveByDateTime = NextFerry.NFTime.toDate(t);
		potentialAlarm.leaveByTime = t;
		potentialAlarm.isSet = true;
		currentAlarm = potentialAlarm;
		currentAlarm.asMillis = leaveByDateTime.getTime();

		window.localStorage["alarm"] = JSON.stringify( deflateAlarm(currentAlarm) );
		setNotifications();
	};

	var clearAlarm = function() {
		currentAlarm = {};
		delete window.localStorage["alarm"];
		Timer.timerTickingOff();
		setNotifications();
	};

	var cancelEdit = function() {
		potentialAlarm = undefined;
	};

	var checkAlarm = function() {
		// return false if there is no active pending alarm,
		// otherwise return the relevant alarm data.
		if ( currentAlarm == {} || !currentAlarm.isSet || !currentAlarm.asMillis )
			return false;
		else if ( currentAlarm.asMillis < Date.now() ) {
			// we have an alarm, but it is out of date --- we must not have caught
			// it with our timeout.
			// so trigger the event now, anyway, which might get noticed.
			listeners.fire("late");
			currentAlarm.isSet = false;
			return false;
		}
		else {
			return deflateAlarm(currentAlarm);
		}
	};


	// we do notification two ways: via the system local notification, and internally
	// via a triggered event.
	var setNotifications = function() {
		checkAlarm(); // get rid of out of date alarms

		if ( currentAlarm.isSet ) {
			var delay = currentAlarm.asMillis - Date.now();
			if ( timerID ) {
				clearTimeout(timerID);
			}
			timerID = setTimeout( function() {
				// check to see if we still really belong here?
				listeners.fire("now");
			}, delay);

			if ( window.plugin ) {
				// instead of trying to keep tabs on what notification is out there, we
				// simply re-issue the notification we want or cancel if we don't want.
				// much more robust.
				var args = {
					id: "NextFerryAlarm",
					date: new Date(currentAlarm.asMillis),
					message: "Time to leave for the ferry!",
					repeat: "minutely",
					autoCancel: true
				};
				console.log(args)
				window.plugin.notification.local.add(args);
			}
			else {
				console.log("notification not available");
			}
		}
		else { // unset
			if ( timerID ) {
				clearTimeout(timerID);
				timerID = undefined;
			}
			if ( window.plugin ) {
				window.plugin.notification.local.cancel("NextFerryAlarm");
			}
		}
	};


	// display a countdown timer on an element.
	var Timer = function() {
		var timerElement = undefined;
		var ticking = false;

		var setTimer = function(selector) {
			timerElement = selector[0];
		}

		var timerTickingOn = function() {
			ticking = true;
			emitTimer(true);
			setTimeout( tick, 1000 );
		};

		var timerTickingOff = function() {
			ticking = false;
		};

		var tick = function() {
			if (ticking) {
				emitTimer();
				setTimeout( tick, 1000 );
			}
		};

		var emitTimer = function(firstCall) {
			if (timerElement) {
				var delta = Math.floor((currentAlarm.asMillis - Date.now()) / 1000);
				var minus = "";
				var hours, minutes, seconds;

				if ( delta < 0 ) {
					delta = -delta;
					minus = "-";
				}

				hours = Math.floor( delta / 3600 );
				minutes = Math.floor( delta / 60 ) % 60;
				seconds = delta % 60;

				timerElement.innerText =
					minus +
					( hours > 0 ? hours + ":" : "" ) +
					( minutes < 10 ? "0" : "" ) + minutes + ":" +
					( seconds < 10 ? "0" : "" ) + seconds;
			}
		};

		submodule = {
			setTimer : setTimer,
			timerTickingOn : timerTickingOn,
			timerTickingOff : timerTickingOff
		};

		return submodule;
	}();


	var module = {
		// accessors: if we are working with a potential Alarm, return that,
		// otherwise return the current alarm, otherwise return undefined.
		isSet : function() { return (potentialAlarm||currentAlarm).isSet; },
		route : function() { return (potentialAlarm||currentAlarm).route; },
		ferryTime : function() { return (potentialAlarm||currentAlarm).ferryTime; },
		leaveByTime : function() { return leaveByTime(potentialAlarm||currentAlarm); },
		goodness : function(t) { return goodness(potentialAlarm||currentAlarm, t); },

		init : init,
		configure : configure,
		reopen : reopen,
		confirm : confirm,
		cancelEdit : cancelEdit,
		clearAlarm : clearAlarm,
		checkAlarm : checkAlarm,
		listeners : listeners,

		Timer : Timer
	};

	return module;
}(jQuery));
