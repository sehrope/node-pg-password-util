default: deps compile

deps: node_modules

node_modules:
	npm ci

clean:
	rm -rf lib node_modules coverage

compile:
	npm run compile

watch:
	./node_modules/.bin/tsc --watch --declaration

test:
	npm run test

clean-cov:
	rm -rf coverage

test-cov:
	npm run test-cov

lint:
	./node_modules/.bin/eslint src

package: clean deps compile

publish: package test
	npm publish

.PHONY: default deps clean compile test test-cov watch package publish
