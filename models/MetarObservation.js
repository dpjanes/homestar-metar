/*
 *  MetarObservation.js
 *
 *  David Janes
 *  IOTDB
 *  2015-12-23
 */

var iotdb = require("iotdb");

exports.binding = {
    bridge: require('../MetarBridge').Bridge,
    model: require('./MetarObservation.json'),
};
