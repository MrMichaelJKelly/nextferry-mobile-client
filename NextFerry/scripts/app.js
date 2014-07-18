var app = (function ($, NextFerry) {
	var dir = "west";

	var init = function() {
        $("#mainpage").on('touchmove', function (e) { e.preventDefault(); }, false);
        
		renderRoutes();
		ServerIO.loadSchedule.listeners.add(renderTimes);

		if ( window.localStorage["cache"] ) {
			ServerIO.loadSchedule( window.localStorage["cache"] );
		}
		ServerIO.requestUpdate();

		var mainScroll = new IScroll("#outerwrap");
		var timeScroll = new IScroll("#timeswrap",
			{
				scrollX: true,
				scrollY: false
			});
	};

	var routeTmpl = {
		west : "<li>{%= displayName.west %}</li>",
		east : "<li>{%= displayName.east %}</li>"
	};
	var timeTmpl = {
		west : "<li>&nbsp;{%each(i,v) this.data.futureDepartures('west') %}{%= NextFerry.timeString(v) %} {%/each%}</li>",
		east : "<li>&nbsp;{%each(i,v) this.data.futureDepartures('east') %}{%= NextFerry.timeString(v) %} {%/each%}</li>"
	}

	var renderRoutes = function() {
		$("#routes").empty();
		$.tmpl(routeTmpl[dir], NextFerry.allRoutes).appendTo("#routes");
	}
	var renderTimes = function() {
		$("#times").empty();
		$.tmpl(timeTmpl[dir], NextFerry.allRoutes).appendTo("#times");
	}


	var ServerIO = (function(){
		var initURL = "http://nextferry.appspot.com/init";
		var travelURL = "http://nextferry.appspot.com/traveltimes";
		var appVersion = "4.0";

		var loadSchedule = function( text ) {
			var lines = text.split("\n");
			for (var i in lines) {
				if ( lines[i].length > 2 && lines[i][0] !== "/") {
					NextFerry.Route.loadTimes( lines[i] );
				}
			}
			loadSchedule.listeners.fire();
		};
		loadSchedule.listeners = $.Callbacks();

		var loadAlerts = function( text ) {
			loadAlerts.listeners.fire();
		};
		loadAlerts.listeners = $.Callbacks();

		var processReply = function(data, status, jqXHR) {
			// we use the same function to look through all data sent to us
			// the reply is text format, with sections indicated by
			// lines beginning with '#'
			// So start by breaking on that...
			var chunks = data.split("\n#");
			if (chunks[0][0] === "#") { chunks[0] = chunks[0].slice(1); }
			for( var i in chunks ) {
				var firstnewline = chunks[i].indexOf("\n");
				var header = chunks[i].slice(0,firstnewline);
				var body = chunks[i].slice(firstnewline);
				if ( beginsWith(header, "schedule") ) {
					loadSchedule(body);
					window.localStorage["cachedate"] = header.slice("schedule ".length);
					window.localStorage["cache"] = body;
				}
				else if ( header === "special" ) {
					loadSchedule(body);
				}
				else if ( header === "traveltimes" ) {
					// TODO
				}
				else if ( header === "allalerts" ) {
					// TODO
				}
				else {
					// IGNORE.
				}
			}
		};

		var requestUpdate = function() {
			// returns the chainable request object
			return $.ajax( {
					url : initURL + "/" + appVersion + "/" + (window.localStorage["cachedate"] || ""),
					dataType: "text",
					success: processReply
					// we just ignore failures
				});
		};

		var requestTravelTimes = function(loc) {

		};

		var submodule = {
			requestUpdate : requestUpdate,
			requestTravelTimes : requestTravelTimes,
			processReply : processReply,
			loadSchedule : loadSchedule,
			loadAlerts : loadAlerts
		};
		return submodule;
	}());

	function beginsWith(s1,s2) {
		var i = 0;
		for( ; i < s1.length && i < s2.length; i++ ) {
			if ( s1.charAt(i) !== s2.charAt(i)) {
				return false;
			}
		}
		return (i === s2.length);
	}


	var module = {
		init : init,
		ServerIO : ServerIO
	  };

	return module;

}(jQuery, NextFerry));
