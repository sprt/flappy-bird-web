import os
import path_fix
from bottle import app, get, request, run, view

IS_DEV = os.environ['SERVER_SOFTWARE'].startswith('Development')

@get('/')
@view('home')
def get_home():
    app_major_version = os.environ['CURRENT_VERSION_ID'].split('.')[0]
    return {
        'IS_DEV': IS_DEV,
        'js_suffix': '.js' if IS_DEV else '.min.js?' + app_major_version
        }

@get('/_ah/warmup')
def get_warmup():
    pass

app = app()
run(debug=IS_DEV, reload=IS_DEV, server='gae')
