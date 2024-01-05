default: deps compile

deps: node_modules

node_modules:
	npm ci

clean:
	rm -rf lib node_modules coverage

compile:
	node_modules/.bin/tsc --declaration

watch:
	node_modules/.bin/tsc --watch --declaration

test:
	node_modules/.bin/ts-mocha test/suite.ts --exit $(TEST_ARGS)

clean-cov:
	rm -rf coverage

test-cov:
	node_modules/.bin/c8 \
	  --require source-map-support/register \
	  --require ts-node/register \
	  --reporter=html \
	  --reporter=lcov \
	  --extension .ts \
	  node_modules/.bin/ts-mocha --exit test/suite.ts

lint:
	node_modules/.bin/eslint src

package: clean deps compile

publish: package test
	npm publish

.PHONY: default deps clean compile test test-cov watch package publish
