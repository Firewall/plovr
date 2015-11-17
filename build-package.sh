#!/bin/bash

set -ex

cd `dirname $0`
rm -f package/bin/plovr.jar
buck clean
buck build plovr
cp buck-out/gen/plovr.jar ../coscale/interfaces/app/project/lib/plovr.jar
