/*
 *  NOTE: prefer iotdb versions
 *
 *  This will:
 */

"use strict";

var Bridge = require('../MetarBridge').Bridge;

var exemplar = new Bridge({
    station: "CYYT",
});
exemplar.discovered = function (bridge) {
    console.log("+", "got one", "\n ", bridge.meta());
    bridge.pulled = function (state) {
        console.log("+", "state-change", "\n ", state);
    };
    bridge.connect({});

};
exemplar.discover();
