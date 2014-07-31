(function ($) {
    /*
    	From http://weblog.west-wind.com/posts/2014/Feb/22/Using-CSS-Transitions-to-SlideUp-and-SlideDown,
    	with a few edits by me.
    
        jquery.slide-transition plug-in

        Requirements:
        -------------
        You'll need to define these two styles to make this work:

        .slide {
            -webkit-transition: max-height 0.5s ease-in-out;
            -moz-transition: max-height 0.5s ease-in-out;
            -o-transition: max-height 0.5s ease-in-out;
            transition: max-height 0.5s ease-in-out;
            overflow-y: hidden;            
        }
        .slide-hidden {            
            max-height: 0;            
        }

        You need to wrap your actual content that you
        plan to slide up and down into a container. This
        container has to have a class of height-transition
        and optionally height-transition-hidden to initially
        hide the container (collapsed).

        <div id="SlideContainer" 
                class="slide slide-hidden">
            <div id="Actual">
                Your actual content to slide up or down goes here
            </div>
        </div>

        To call it:
        -----------
        var $sw = $("#SlideWrapper");

        if (!$sw.hasClass("slide-hidden"))
            $sw.slideUpTransition();                      
        else 
            $sw.slideDownTransition();
    */
    $.fn.slideUpTransition = function() {
        return this.each(function() {
            var $el = $(this);
            $el.css("max-height", "0");
            $el.addClass("slide-hidden");
                    
        });
    };

    $.fn.slideDownTransition = function() {
        return this.each(function() {
            var $el = $(this);
            $el.removeClass("slide-hidden");

            // temporarily make visible to get the size
            $el.css("max-height", "none");
            var height = $el.outerHeight();

            // reset to 0 then animate with small delay
            $el.css("max-height", "0");

            setTimeout(function() {
                $el.css({
                    "max-height": height
                });
            }, 1);
        });
    };
    
    $.fn.slideToggleTransition = function() {
    	return this.each(function() {
            var $el= $(this);
            if ( $el.hasClass("slide-hidden") ) {
                $el.slideDownTransition();
            }
            else {
                $el.slideUpTransition();
            }
        });
    };
    
})(jQuery);