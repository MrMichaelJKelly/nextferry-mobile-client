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

	var deflateAlarm = function( al ) {
		// take an alarm and remove all but the essential bits
		var newal = {
			routeId: al.routeId,
			dir: al.dir,
			ferryTime: al.ferryTime,
			isSet: (al.isSet || false)
		};
		if ( newal.isSet ) {
			newal.leaveByTime = al.leaveByTime;
		}
		return newal;
	};

	var alEqual = function(al1, al2) {
		// return true if the alarms are for the same departure
		return ( al1.route === al2.route &&
				 al1.dir === al2.dir &&
				 al1.ferryTime === al2.ferryTime );
	};

	var leaveByTime = function(al) {
		if ( ! al.leaveByTime ) {
			var tt = al.term.tt || 60;
			al.leaveByTime = al.ferryTime - tt;
		}
		return al.leaveByTime;
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

	var confirm = function() {

	};

	var clearAlarm = function() {
		currentAlarm = {};
	};

	var cancelEdit = function() {
		potentialAlarm = undefined;
	};

	var module = {
		// accessors: if we are working with a potential Alarm, return that,
		// otherwise return the current alarm, otherwise return undefined.
		isSet : function() { return (potentialAlarm||currentAlarm).isSet; },
		route : function() { return (potentialAlarm||currentAlarm).route; },
		ferryTime : function() { return (potentialAlarm||currentAlarm).ferryTime; },
		leaveByTime : function() { return leaveByTime(potentialAlarm||currentAlarm);; },

		init : init,
		configure : configure,
		confirm : confirm,
		cancelEdit : cancelEdit,
		clearAlarm : clearAlarm
	};

	return module;
}(jQuery));
