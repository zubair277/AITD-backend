FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port (5001 as required by config/user)
EXPOSE 5001

# Start the application
CMD ["npm", "start"]
