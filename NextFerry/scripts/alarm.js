/*
 * Encapsulate our functionality for managing a local notification alarm
 * on a particular ferry departure.
 * Uses NextFerry, but no other
*/

var Alarm = (function($) {
	"use strict";

	// Our internal state
	var enabled = false;			// only enable if the plugin exists.
	var currentAlarm = {};			// if non-empty, this alarm has been set
	var potentialAlarm = undefined;	// this is an alarm that may be set,
									// replacing the current alarm.
									// undefined if we aren't working on one now.
	// a note on time formats:
	// ferryTime and leaveByTime are in NFTime format (and date=today is implicit)
	// asMillis is the full time of scheduled notification, including date.

	var listeners = $.Callbacks();	// internal signaling that the alarm went off
	var notificationPlugin = false;

	var leavebyToast = {
		id: 1,
		title: "Next Ferry",
		text: "Time to leave for the ferry!",
		every: "minute",
		firstAt: 0, // filled in later
		sound: "file://sounds/kalimba.wav"
		// todo: Android icon
	};

	var init = function() {
		currentAlarm = {};
		potentialAlarm = undefined;

		// TURN EVERYTHING OFF
		// Someday I will figure out how to actually make this work.
		/*
		if ( window.localStorage["alarm"] ) {
			currentAlarm = inflateAlarm(JSON.parse(window.localStorage["alarm"]));
		}

		// check if the plugin is available or not.
		if ( window.plugin && window.plugin.notification && window.plugin.notification.local ) {
			enabled = true;
			notificationPlugin = window.plugin.notification.local;
			if (device.platform.substr(0,3) === "ios") {
				leavebyToast.sound = "file://sounds/kalimba.caf";
			}

			notificationPlugin.on("trigger", onTrigger);
			syncNotificationState();
		}
		*/
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
			mylog("BUG: shouldn't get here.  faking an entry.");
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
		syncNotificationState();
	};

	var clearAlarm = function() {
		currentAlarm = {};
		delete window.localStorage["alarm"];
		Timer.timerTickingOff();
	};

	var dismissAlarm = function() {
		clearAlarm();
		syncNotificationState();
	}

	var cancelEdit = function() {
		potentialAlarm = undefined;
	};

	var checkAlarm = function() {
		// return false if there is no active pending alarm,
		// otherwise return the relevant alarm data.
		if ( currentAlarm == {} || !currentAlarm.isSet || !currentAlarm.asMillis )
			return false;
		else
			return deflateAlarm(currentAlarm);
	};

	var onTrigger = function() {
		// if there is still an alarm when we get here, trigger it.
		if ( checkAlarm() ) {
			clearAlarm();	// prevent multiple signalling
			listeners.fire("now");
		}
	}

	// if we have system notification, we rely on that (and if the user has turned it off,
	// so be it).  If we don't then we use a timer.

	var syncNotificationState = function() {
		if ( enabled ) {
			try {
				if ( currentAlarm.isSet ) {
					leavebyToast.firstAt =  new Date(currentAlarm.asMillis);
					notificationPlugin.schedule(leavebyToast);
					console.log(leavebyToast);
				}
				else { // unset
					notificationPlugin.cancel(leavebyToast.id);
				}
			} catch(e) {
				console.log("syncNotificationState", e);
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

		var submodule = {
			setTimer : setTimer,
			timerTickingOn : timerTickingOn,
			timerTickingOff : timerTickingOff
		};

		return submodule;
	}();


	var module = {
		// accessors: if we are working with a potential Alarm, return that,
		// otherwise return the current alarm, otherwise error.
		isSet : function() { return (potentialAlarm||currentAlarm).isSet; },
		route : function() { return (potentialAlarm||currentAlarm).route; },
		ferryTime : function() { return (potentialAlarm||currentAlarm).ferryTime; },
		leaveByTime : function() { return leaveByTime(potentialAlarm||currentAlarm); },
		goodness : function(t) { return goodness(potentialAlarm||currentAlarm, t); },

		enabled : function() { return enabled },
		init : init,
		configure : configure,
		reopen : reopen,
		confirm : confirm,
		cancelEdit : cancelEdit,
		dismissAlarm : dismissAlarm,
		checkAlarm : checkAlarm,
		listeners : listeners,

		Timer : Timer,

		// for debugging
		plugin : function() { return notificationPlugin; },
		toast : function() { return leavebyToast; }
	};

	return module;
}(jQuery));
