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
      in order to avoid conflict with navigator.geolocation initialization.
    * Added a spoofing capability for testing purposes.  To control the behavior
      of the function, set these options by setting the properties _on the function
      object_:
        * spoof_value: return this location value
        * spoof_error: return this error
      todo: could add spoofing of progress indicator, timeouts, etc.
      Note: you can set/turn off spoofing behavior while the "real" function is
      running.  With the usual caveats about asynchronous behavior, it will change
      it's behavior as it is running.
*/

function getAccuratePosition(geolocationSuccess, geolocationError, geoprogress, options) {
    var lastCheckedPosition,
        locationEventCount = 0,
        watchID,
        timerID,
        self;

    options = options || {};
    self = getAccuratePosition;

    var spoofed = function() {
        if (self.spoof_value) {
            timerID && clearTimeout(timerID);
            watchID && navigator.geolocation.clearWatch(watchID);
            geolocationSuccess(self.spoof_value);
            return true;
        }
        else if (self.spoof_error) {
            timerID && clearTimeout(timerID);
            watchID && navigator.geolocation.clearWatch(watchID);
            geolocationError && geolocationError(self.spoof_error);
            return true;
        }
        return false;
    };

    var checkLocation = function (position) {
        if ( !spoofed() ) {
            lastCheckedPosition = position;
            locationEventCount = locationEventCount + 1;
            // We ignore the first event unless it's the only one received because some devices seem to send a cached
            // location even when maxaimumAge is set to zero
            if ((position.coords.accuracy <= options.desiredAccuracy) && (locationEventCount > 1)) {
                clearTimeout(timerID);
                navigator.geolocation.clearWatch(watchID);
                foundPosition(position);
            }
            else {
                geoprogress && geoprogress(position);
            }
        }
    };

    var stopTrying = function () {
        if ( !spoofed() ) {
            navigator.geolocation.clearWatch(watchID);
            foundPosition(lastCheckedPosition);
        }
    };

    var onError = function (error) {
        if ( !spoofed() ) {
            clearTimeout(timerID);
            navigator.geolocation.clearWatch(watchID);
            geolocationError && geolocationError(error);
        }
    };

    var foundPosition = function (position) {
        // spoofing already handled in checkposition & stopTrying
        geolocationSuccess(position);
    };

    if (!options.maxWait)
        options.maxWait = 10000; // Default 10 seconds
    if (!options.desiredAccuracy)
        options.desiredAccuracy = 20; // Default 20 meters
    if (!options.timeout)
        options.timeout = options.maxWait; // Default to maxWait

    options.maximumAge = 0; // Force current locations only
    options.enableHighAccuracy = true; // Force high accuracy (otherwise, why are you using this function?)

    watchID = navigator.geolocation.watchPosition(checkLocation, onError, options);
    timerID = setTimeout(stopTrying, options.maxWait); // Set a timeout that will abandon the location loop
}
