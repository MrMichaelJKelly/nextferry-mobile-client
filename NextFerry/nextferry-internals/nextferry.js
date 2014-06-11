var NextFerry = (function ($) {
    
    function Route(first, last) {
        this.first = first;
        this.last = last;
    }
    Route.prototype.fullName = function() {
        return this.first + ' ' + this.last;
    };
    Route.prototype.fullNameReversed = function() {
        return this.last + ', ' + this.first;
    };
    
    function Schedule(first, last) {
        this.first = first;
        this.last = last;
    }
    Schedule.prototype.fullName = function() {
        return this.first + ' ' + this.last;
    };
    Schedule.prototype.fullNameReversed = function() {
        return this.last + ', ' + this.first;
    };
    
    function Terminal(c, n, l) {
        this.code = c;
        this.name = n;
        this.loc = l;
        this.hasTT = false;
    }
    Terminal.prototype.setTT = function(est) {
        this.hasTT = true;
        this.tt = est;
    };
    Terminal.prototype.clear = function() {
        this.hasTT = false;
    };
    var allTerminals = {
        1 : new Terminal(1, "Anacortes", "48.502220, -122.679455"),
        3 : new Terminal(3, "Bainbridge Island", "47.623046, -122.511377"),
        4 : new Terminal(4, "Bremerton", "47.564990, -122.627012"),
        5 : new Terminal(5, "Clinton", "47.974785, -122.352139"),
        8 : new Terminal(8, "Edmonds", "47.811240, -122.382631"),
        9 : new Terminal(9, "Fauntleroy", "47.523115, -122.392952"),
        10 : new Terminal(10, "Friday Harbor", "48.535010, -123.014645"),
        11 : new Terminal(11, "Coupeville", "48.160592, -122.674305"),
        12 : new Terminal(12, "Kingston", "47.796943, -122.496785"),
        13 : new Terminal(13, "Lopez Island", "48.570447, -122.883646"),
        14 : new Terminal(14, "Mukilteo", "47.947758, -122.304138"),
        15 : new Terminal(15, "Orcas Island", "48.597971, -122.943985"),
        16 : new Terminal(16, "Point Defiance", "47.305414, -122.514123"),
        17 : new Terminal(17, "Port Townsend", "48.112648, -122.760715"),
        7 : new Terminal(7, "Seattle", "47.601767, -122.336089"),
        18 : new Terminal(18, "Shaw Island", "48.583991, -122.929351"),
        20 : new Terminal(20, "Southworth", "47.512130, -122.500970"),
        21 : new Terminal(21, "Tahlequah", "47.333023, -122.506999"),
        22 : new Terminal(22, "Vashon Island", "47.508616, -122.464127")       
    };

    
    var module = {
      Route : Route,
      Schedule : Schedule,
      Terminal : Terminal,
      allTerminals : allTerminals
    };

    return module;
}(jQuery));