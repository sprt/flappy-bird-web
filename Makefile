.PHONY: compile_js deploy

compile_js:
	java -jar scripts/compiler.jar \
	--compilation_level SIMPLE_OPTIMIZATIONS \
	--language_in ECMASCRIPT5_STRICT --summary_detail_level 3 \
	--warning_level VERBOSE --js static/scripts/game.js \
	--js_output_file static/scripts/game.min.js
	git add static/scripts/game.min.js
	-git commit -m "Compile JS"

deploy: compile_js
	../google_appengine/appcfg.py --oauth2 update .
	../google_appengine/appcfg.py --oauth2 set_default_version .
