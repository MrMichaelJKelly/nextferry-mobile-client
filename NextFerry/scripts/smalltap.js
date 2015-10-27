(function() {
	// On IOS we use Hammer.js which does a phenomenal job.  However it doesn't seem to
	// work well at all on Android.  So on Android we do our own minimal
	// implementation of "tap" which works for our scenario.
	// The rules are simple: taps have to begin and end on the same element, and they
	// can't occur **less than** 100ms apart.  Long presses count as taps.
	// Plus the standard check on distance moved.
	//
	// This works for button-like elements where there is no ambiguity with other gestures
	// on the same elments.

	"use strict";
	var target;
	var loc;
	var moveTolerance = 10;
	var prevTime = -1;

	var startTap = function(ev) {
		target = $(ev.currentTarget);
		loc = { x: ev.screenX, y: ev.screenY };
		return true;
	};

	var endTap = function(action) {
		return function(ev) {
			var elem = $(ev.currentTarget);
			var now = Date.now();

			if ( elem.is(target) && now - prevTime > 100 && compareloc(ev)) {
				target = null;
				prevTime = now;
				return action(ev);
			}
			return true;
		};
	};

	// Add a highlight to the tapped thing
	var highlight = function(action) {
		return function(ev) {
			var elem = $(ev.currentTarget);
			elem.addClass("tapped");
			setTimeout( function() { elem.removeClass("tapped"); }, 250);
			return action(ev);
		}
	}

	var compareloc = function(ev) {
		// compare the location in ev to the saved locations,
		// returning true if they are the close enough.
		var newloc = { x: ev.screenX, y: ev.screenY };
		if ( loc && loc.x && loc.y && newloc.x && newloc.y ) {
			return (Math.abs( loc.x - newloc.x ) < moveTolerance &&
				    Math.abs( loc.y - newloc.y ) < moveTolerance);
		}
		return true;
	};

	var isAndroid = !!(navigator.userAgent.match(/Android/));

	$.fn.onTap = function(action) {
		if ( isAndroid ) {
			// use our own, and look for mouse events *and* iScroll's events
		 	this.on("mousedown",startTap);
			this.on("mouseup", endTap(highlight(action)));
			this.on("tap", highlight(action));
		}
		else {
			// use hammer.js
			this.each( function(i, elem) {
		        var mc = new Hammer.Manager(elem);
		        mc.add(new Hammer.Tap());
		        mc.on("tap", highlight(action));
		    });
		}
		return this;
    };

}());
