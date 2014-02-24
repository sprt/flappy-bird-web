import os
import path_fix
from bottle import app, get, request, run, view

IS_DEV = os.environ['SERVER_SOFTWARE'].startswith('Development')

@get('/')
@view('home')
def get_home():
    return {'IS_DEV': IS_DEV}

@get('/_ah/warmup')
def get_warmup():
    pass

app = app()
run(app=app, debug=IS_DEV, reload=IS_DEV, server='gae')
