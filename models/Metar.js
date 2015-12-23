/*
 *  Metar.js
 *
 *  David Janes
 *  IOTDB
 *  2015-12-23
 */

var iotdb = require("iotdb");

exports.Model = iotdb.make_model('MetarSomething')
    // .facet(":lighting")
    .name("Metar")
    // .description("Metar")
    .io("on", iotdb.boolean.on)
    .make();

exports.binding = {
    bridge: require('../MetarBridge').Bridge,
    model: exports.Model,
};
