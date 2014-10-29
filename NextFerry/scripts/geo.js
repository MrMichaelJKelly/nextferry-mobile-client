/*
Original:
Copyright (C) 2013 Greg Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Obtained from https://github.com/gwilson/getAccurateCurrentPosition,
638e06d17ac9055ec9746870db2fc6cd52d85f19.

I've made the following modifications:
    * Defined function in global namespace instead of inside navigator.geolocation
      in order to avoid conflict with navigator initialization.
    * Allow callbacks other than success to be omitted.
    * Added a spoofing capability for testing purposes.  To control the behavior
      of the function, set these options by setting the properties on the function
      object (e.g. getAccuratePosition.spoof_value = ...):
        * spoof_value: return this location value
        * spoof_error: return this error
      todo: could add spoofing of progress indicator, timeouts, etc.
      Note: you can set/turn off spoofing behavior while the "real" function is
      running.  With the usual caveats about asynchronous behavior, it will change
      it's behavior as it is running.
*/

var callCount = 0;

function getAccuratePosition(onSuccess, onError, onProgress, options) {
    var lastCheckedPosition,
        locationEventCount = 0,
        watchID,
        timerID,
        self,
        cleared = false,
        myCallCount = callCount++;

    options = options || {};
    self = getAccuratePosition;

    console.log("gAP call", myCallCount);

    var clear = function() {
        console.log("gAP clear", myCallCount);
        timerID && clearTimeout(timerID);
        watchID && navigator.geolocation.clearWatch(watchID);
        cleared = true;
    }

    var spoofed = function() {
        console.log("gAP: check spoof", myCallCount);
        if ( !cleared ) {
            if (self.spoof_value) {
                console.log("gAP spoof", myCallCount);
                clear();
                onSuccess(self.spoof_value);
                return true;
            }
            else if (self.spoof_error) {
                clear();
                onError && onError(self.spoof_error);
                return true;
            }
        }
        return false;
    };

    var checkLocation = function (position) {
        console.log("gAP: check", myCallCount);
        if ( !spoofed() && !cleared ) {
            lastCheckedPosition = position;
            locationEventCount = locationEventCount + 1;
            // We ignore the first event unless it's the only one received because some devices seem to send a cached
            // location even when maxaimumAge is set to zero
            if ((position.coords.accuracy <= options.desiredAccuracy) && (locationEventCount > 1)) {
                clear();
                onSuccess(position);
            }
            else {
                console.log("gAP: not yet", myCallCount);
                onProgress && onProgress(position);
            }
        }
    };

    var stopTrying = function () {
        console.log("gAP: stop", myCallCount);
        if ( !spoofed() && !cleared ) {
            clear();
            onSuccess(lastCheckedPosition);
        }
    };

    var geoError = function (error) {
        console.log("gAP: internal error", myCallCount);
        if ( !spoofed() && !cleared ) {
            clear();
            onError && onError(error);
        }
    };


    if (!options.maxWait)
        options.maxWait = 10000; // Default 10 seconds
    if (!options.desiredAccuracy)
        options.desiredAccuracy = 20; // Default 20 meters
    if (!options.timeout)
        options.timeout = options.maxWait; // Default to maxWait

    options.maximumAge = 0; // Force current locations only
    options.enableHighAccuracy = true; // Force high accuracy (otherwise, why are you using this function?)

    if( navigator && navigator.geolocation ) {
        watchID = navigator.geolocation.watchPosition(checkLocation, geoError, options);
        timerID = setTimeout(stopTrying, options.maxWait); // Set a timeout that will abandon the location loop
        console.log("gAP: ready", myCallCount);
    }
    else {
        onError( { code: 2, message: "Geolocation not initialized" });
    }
}
