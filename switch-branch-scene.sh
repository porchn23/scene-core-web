#!/bin/bash
(
	cd ../scene-core-api
	git checkout "$1"
	npm install > /dev/null 2>&1
) &
(
	cd ../scene-core-web
	git checkout "$1"
	npm install > /dev/null 2>&1
) &
(
	cd ../scene-core-native
	git checkout "$1"
	npm install > /dev/null 2>&1
) &
wait
