/*
    This is derived from original code fount at
    https://github.com/gwilson/getAccurateCurrentPosition.
    I've made substantial changes.

    The original contained the following copyright:

Copyright (C) 2013 Greg Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
*/

var getAccuratePositionCallCount = 0;

function getAccuratePosition(onSuccess, onError, onProgress, options) {
    var bestResult,
        tries = 0,
        ended = false;
        geoOptions = {},
        self = getAccuratePosition,
        ended = false,
        myCallCount = getAccuratePositionCallCount++;

    var clog = function(arg) {
        console.log("gAP(" + myCallCount + ") " + arg);
    };

    var ageInRange = function(position) {
        // checking age with a fudge factor.
        return  (Date.now() - position.timestamp) < (options.maximumAge + 100);
    };

    var checkLocation = function(position) {
        clog("check position " + position.coords.accuracy);
        if ( !ended ) {
            tries++;

            // first time through double check the maximumAge, because some
            // implementations seem to ignore.
            if ( tries > 1 || ageInRange(position) ) {

                if ( !bestResult || position.coords.accuracy < bestResult.coords.accuracy ) {
                    bestResult = position;
                }

                if ((options.maxtries && (tries > options.maxtries)) ||
                    (bestResult.coords.accuracy <= options.accuracy)) {
                    gAPSuccess(bestResult);
                    return; // termination
                }
            }

            clog("not yet");
            onProgress && onProgress(position);
            // try again, and no more caching
            geoOptions.maximumAge = 0;
            navigator.geolocation.getCurrentPosition(checkLocation, gAPError, geoOptions);
        }
    };

    var stopTrying = function() {
        clog("stop");
        if (bestResult) {
            gAPSuccess(bestResult);
        }
        else {
            gAPError({code: 3, message: "time out" });
        }
    };

    var cancel = function() {
        clog("cancelled");
        gAPError({code: 3, message: "cancelled" });
    };

    // our handlers that call the user's handlers

    var gAPError = function(error) {
        clog("error");
        console.log(error);
        if ( !ended ) {
            ended = true;
            onError && onError(error);
        }
    };

    var gAPSuccess = function(position) {
        clog("success");
        if ( !ended ) {
            ended = true;
            onSuccess(position);
        }
    };

    // There are two options that control how long we try, leading to
    // four possible combinations:
    // timeout != 0, maxtries == 0:  return no later than timeout
    // timeout == 0, maxtries != 0:  return after no more than maxtries
    // timeout != 0, maxtries != 0:  satisfy both
    // timeout == 0, maxtries == 0:  keep going until a good result, or cancelled
    //
    // if only one of timeout or maxtries is specified, the other is assumed to
    // be zero.
    // if neither is specified, both are set to default (non-zero) values.
    // the only way to get the last case is to explictly set both options to 0.
    //

    options = options || {};
    if ( !("timeout" in options) && !("maxtries" in options)) {
        options.timeout = 3 * 60 * 1000; // default 3 minutes (GPS takes time!)
        options.maxtries = 6;   // default six tries
    }
    if ( !options.accuracy ) {
        options.accuracy = 100; // default 100 meters.
    }
    if ( !options.log ) {
        clog = function() { };
    }
    else if ( typeof(options.log) === "function" ) {
        clog = options.log;
    }

    geoOptions = {
        // no timeout: we do our own!
        enableHighAccuracy : true,
        maximumAge : (options.maximumAge || 0)
    };

    clog("called");

    if( navigator && navigator.geolocation ) {
        // we use getCurrentPosition, rather than watchPosition, because
        // sometimes we can't turn the watchPosition off, and that is a
        // problem for battery life.
        navigator.geolocation.getCurrentPosition(checkLocation, gAPError, geoOptions);
        if (options.timeout) {
            timerID = setTimeout(stopTrying, options.timeout);
        }
        clog("running");
    }
    else {
        gAPError({ code: 2, message: "Geolocation not ready" });
    }

    return cancel;
}
