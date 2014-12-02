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

	var init = function() {
		currentAlarm = {};
		potentialAlarm = undefined;

		if ( window.localStorage["alarm"] ) {
			currentAlarm = inflateAlarm(JSON.parse(window.localStorage["alarm"]));
		}
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
		// leave with a proper buffer time, or 60 minutes if we can't guess
		if ( ! al.leaveByTime ) {
			var buffer = ( al.term.tt ?
							al.term.tt + parseInt(window.localStorage["bt"])
							: 60 );
			al.leaveByTime = al.ferryTime - buffer;
		}
		// but in no case, earlier than it is now.
		if ( al.leaveByTime < NextFerry.NFTime.now()+5 ) {
			al.leaveByTime = NextFerry.NFTime.now()+5;
		}
		return al.leaveByTime;
	};

	var goodness = function(al, t) {
		return (al.term ? al.term.tGoodness(t) : "Unknown");
	};

	var configure = function(rid,dir,ferry) {
		// set up potentialAlarm to work with
		var proto = {
			routeId: rid,
			dir: dir,
			ferryTime: ferry
		};
		// if it is the same alarm we already have, then copy that.
		potentialAlarm = ( alEqual(proto,currentAlarm) ?
			currentAlarm : inflateAlarm(proto) );
	};

	var confirm = function(t) {
		var leaveByDateTime = NextFerry.NFTime.toDate(t);
		potentialAlarm.leaveByTime = t;
		potentialAlarm.isSet = true;
		currentAlarm = potentialAlarm;
		currentAlarm.asMillis = leaveByDateTime.getTime();

		window.localStorage["alarm"] = JSON.stringify( deflateAlarm(currentAlarm) );
		if ( window.plugin ) {
			window.plugin.notification.local.add({
				id: "foo",
				date: leaveByDateTime,
				message: "Time to leave for the ferry!",
				repeat: "minutely",
				badge: 1
			});
		}
		else {
			console.log("notification not available");
		}
	};

	var clearAlarm = function() {
		currentAlarm = {};
		if ( window.plugin ) {
			window.plugin.notification.local.cancelAll();
		}
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
			currentAlarm.isSet = false;
			return false;
		}
		else {
			return deflateAlarm(currentAlarm);
		}
	}

	var module = {
		// accessors: if we are working with a potential Alarm, return that,
		// otherwise return the current alarm, otherwise return undefined.
		isSet : function() { return (potentialAlarm||currentAlarm).isSet; },
		route : function() { return (potentialAlarm||currentAlarm).route; },
		ferryTime : function() { return (potentialAlarm||currentAlarm).ferryTime; },
		leaveByTime : function() { return leaveByTime(potentialAlarm||currentAlarm); },
		goodness : function() { return goodness(potentialAlarm||currentAlarm); },

		init : init,
		configure : configure,
		confirm : confirm,
		cancelEdit : cancelEdit,
		clearAlarm : clearAlarm,
		checkAlarm : checkAlarm
	};

	return module;
}(jQuery));
