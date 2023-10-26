FROM python:3.8-slim

# create a virtual environment
RUN python3 -m venv /opt/venv
# install the requirements to the virtual environment
COPY requirements.txt requirements.txt
RUN /opt/venv/bin/pip install -r requirements.txt

COPY server.py /server.py

# this must match the port your Flask server in server.py is running on
EXPOSE 5000
# run our server using the python binary in the virtual environment we've set up
ENTRYPOINT ["/opt/venv/bin/python", "/server.py"]