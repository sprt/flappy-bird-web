.PHONY: compile_js

compile_js:
	java -jar scripts/compiler.jar \
	--compilation_level SIMPLE_OPTIMIZATIONS \
	--language_in ECMASCRIPT5_STRICT --summary_detail_level 3 \
	--warning_level VERBOSE --js static/scripts/game.js \
	--js_output_file static/scripts/game.min.js
	git add static/scripts/game.min.js
	git commit -m "Compile JS"
