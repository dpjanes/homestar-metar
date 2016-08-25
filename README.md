# homestar-metar
[IOTDB](https://github.com/dpjanes/node-iotdb) Bridge for [METAR Observations](https://en.wikipedia.org/wiki/METAR).

<img src="https://raw.githubusercontent.com/dpjanes/iotdb-homestar/master/docs/HomeStar.png" align="right" />

# About

This will pull in thousands of weather observations from around the world as semantic data. It will also check every minute for updates.

* [Read about Bridges](https://github.com/dpjanes/node-iotdb/blob/master/docs/bridges.md)

## Data Source

* Observations are pulled from [NOAA here](http://weather.noaa.gov/pub/data/observations/metar/cycles/).
* Station metadata is pulled from [NOAA here](http://weather.noaa.gov/data/nsd_bbsss.txt).

## Raw Data

Data can be pulled from METAR without IOTDB adding semantic structure.
See [connect.js](https://github.com/dpjanes/homestar-metar/blob/master/samples/connect.js) for an example.

# Installation and Configuration

* [Read this first](https://github.com/dpjanes/node-iotdb/blob/master/docs/install.md)
* [Read about installing Home☆Star](https://github.com/dpjanes/node-iotdb/blob/master/docs/homestar.md) 

Then:

    $ npm install -g homestar    ## may require sudo
    $ npm install homestar-metar
    $ homestar configure homestar-metar

The configure command simply pulls down all the station metadata. 
There is no user interaction required

# Use

## Get everything

    const iotdb = require("iotdb")
    iotdb.use("homestar-metar")

    const things = iotdb.connect("MetarObservation")
	things.on("istate", function(thing) {
        console.log(thing.state("istate"));
    });
	

## Get one specific station

	const things = iotdb.connect("MetarObservation", {
        station: "CYYZ",
    })

## Get set of stations
	
	const things = iotdb.connect("MetarObservation", {
        station: "C???",
    })

See [https://github.com/isaacs/minimatch](minimatch) for glob matching patterns.

# Models
## MetarObservation

See [MetarObservation.iotql](https://github.com/dpjanes/homestar-metar/blob/master/models/MetarObservation.iotql)
