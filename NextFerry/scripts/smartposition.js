/*  smartPosition

    TL;DR:
    the cordova geolocation plugin is required to use smartPosition; see
    https://github.com/apache/cordova-plugin-geolocation.

    smartPosition makes using the cordova geolocation plugin easier.
    It "tries a reasonable amount" to obtain a desired level of
    location accuracy.

    smartPosition has reasonable defaults, so the minimally complex call is just

        smartPosition(onSuccess)

    where the callback function is passed a location object as defined in the
    geolocation docs (https://github.com/apache/cordova-plugin-geolocation/blob/master/doc/index.md)

    FULL DETAILS:
    smartPosition:
       * will request location multiple times until the desired accuracy is achieved,
       * returns the best result it obtains,
       * switches between low and high accuracy as needed,
       * supports both maxtries and timeout,
       * catches and ignores extra callbacks from the native code,
       * logs internal progress, if requested.

    smartPosition is called as follows:

        cancellable = smartPosition(onSuccess,onError,onProgress,options);

    The return value is a function, which if called, will cancel this invocation.

    The callbacks onSuccess(loc), onError(error) and onProgress(loc) are what you'd expect;
    onSuccess is required, the others are optional.

    The options argument is optional, as are all the options in it:

    options = {
        accuracy: desired accuracy in meters (default: 100)
        maximumAge: allowable age of result (default: derived from accuracy)
        maxtries: maximum number of times to try to obtain location
        timeout: maximum time to keep trying in milliseconds
        log: boolean or a logging function (default: false)
    }

    maxtries and timeout have four possible combinations.  here is how they are
    combined:
    timeout != 0, maxtries == 0:  return no later than timeout
    timeout == 0, maxtries != 0:  return after no more than maxtries
    timeout != 0, maxtries != 0:  satisfy both
    timeout == 0, maxtries == 0:  keep going until a good result, or cancelled

    if only one of timeout or maxtries is specified, the other is assumed to
    be zero.
    if neither is specified, both are set to default (non-zero) values.
    the only way to get the last case is to explictly set both options to 0.

    The default is 6 tries and a timeout of three minutes (which sounds long, but
    GPS can take a very long time to initialize!)

    CREDITS:
    smartPosition is derived from original code found at
    https://github.com/gwilson/getAccurateCurrentPosition.
    At this point I have pretty much completely rewritten it, but credit goes to
    Greg Wilson for the original concept.

    There are no licensing terms or restrictions on this code: do whatever you'd
    like with it.
*/

function() {
    var callCount = 0;

    function smartPosition(onSuccess, onError, onProgress, options) {
        var bestResult,
            tries = 0,
            ended = false;
            geoOptions = {},
            ended = false,
            myCallID = callCount++;

        var mylog = function(arg) {
            console.log("smartPosition(" + myCallID + ") " + arg);
        };

        var ageInRange = function(position) {
            // checking age with a fudge factor.
            return  (Date.now() - position.timestamp) < (options.maximumAge + 100);
        };

        var checkLocation = function(position) {
            mylog("check position " + position.coords.accuracy);
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
                        mySuccess(bestResult);
                        return; // termination
                    }
                }

                mylog("not yet");
                onProgress && onProgress(position);

                // try again, and no more caching, and get high accuracy
                geoOptions.maximumAge = 0;
                geoOptions.enableHighAccuracy = true;
                navigator.geolocation.getCurrentPosition(checkLocation, myError, geoOptions);
            }
        };

        var stopTrying = function() {
            mylog("stop");
            if (bestResult) {
                mySuccess(bestResult);
            }
            else {
                myError({code: 3, message: "time out" });
            }
        };

        var cancel = function() {
            mylog("cancelled");
            myError({code: 3, message: "cancelled" });
        };

        // our handlers that call the user's handlers

        var myError = function(error) {
            mylog("error");
            if ( !ended ) {
                ended = true;
                onError && onError(error);
            }
        };

        var mySuccess = function(position) {
            mylog("success");
            if ( !ended ) {
                ended = true;
                onSuccess(position);
            }
        };

        // fill out our options as needed
        options = options || {};
        if ( !("timeout" in options) && !("maxtries" in options)) {
            options.timeout = 3 * 60 * 1000; // default 3 minutes (GPS takes time!)
            options.maxtries = 6;   // default six tries
        }
        if ( !options.accuracy ) {
            options.accuracy = 100; // default 100 meters.
        }
        if ( !options.maximumAge ) {
            // maximum age is only used for the first attempt, after which we will
            // insist on uncached data.
            // default value:
            // handwaving, based on a likely maximum speed of 80km/h ~ 25 m/sec
            // e.g, the default accuracy of 100 m ==> 4 seconds max age.
            options.maximumAge = options.accuracy * 40;
        }
        if ( !options.log ) {
            mylog = function() { };
        }
        else if ( typeof(options.log) === "function" ) {
            mylog = options.log;
        }

        geoOptions = {
            maximumAge : options.maximumAge;
            timeout : options.timeout || Infinity;
        };

        mylog("called");

        if( navigator && navigator.geolocation ) {
            // we use getCurrentPosition, rather than watchPosition, because
            // sometimes we can't turn the watchPosition off, and that is a
            // problem for battery life.
            navigator.geolocation.getCurrentPosition(checkLocation, myError, geoOptions);
            if (options.timeout) {
                timerID = setTimeout(stopTrying, options.timeout);
            }
            mylog("running");
        }
        else {
            myError({ code: 2, message: "Geolocation not ready" });
        }

        return cancel;
    }
}();
