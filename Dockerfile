FROM ros:kinetic-ros-core
WORKDIR /setup
RUN apt-get update && apt-get install -y curl git build-essential
RUN curl -sL https://deb.nodesource.com/setup_10.x -o nodesource_setup.sh
RUN bash nodesource_setup.sh
RUN apt-get install -y nodejs 
WORKDIR /web
COPY npm-shrinkwarp.json .
COPY package.json .
RUN npm install
EXPOSE 3000
ADD . .
CMD node index.js