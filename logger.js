// logger.js - Utility to log messages to file and console

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ES module
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Log levels configuration
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Current log level - change this to control verbosity
const CURRENT_LOG_LEVEL = LOG_LEVELS.DEBUG; // Set to DEBUG to see all logs

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create log file name with date
const getLogFileName = () => {
  const date = new Date();
  const fileName = `physiospa_${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}.log`;
  return path.join(logsDir, fileName);
};

// Format log message with timestamp
const formatLogMessage = (message, level) => {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${level}] ${message}`;
};

// Write to log file
const writeToLogFile = (message) => {
  try {
    fs.appendFileSync(getLogFileName(), message + '\n');
  } catch (err) {
    console.error(`Error writing to log file: ${err.message}`);
  }
};

// Check if we should log this level
const shouldLog = (level) => {
  return LOG_LEVELS[level] >= CURRENT_LOG_LEVEL;
};

// Generic logging function
const logMessage = (message, args, level) => {
  if (!shouldLog(level)) return;
  
  const formattedMessage = formatLogMessage(
    typeof message === 'object' ? JSON.stringify(message, null, 2) : message, 
    level
  );
  writeToLogFile(formattedMessage);
  
  // Also log to console for DEBUG level
  if (level === 'DEBUG') {
    console.log(formattedMessage);
  }
  
  // Log additional args if present
  if (args.length > 0) {
    args.forEach(arg => {
      const formattedArg = formatLogMessage(
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg,
        level
      );
      writeToLogFile(formattedArg);
      
      // Also log to console for DEBUG level
      if (level === 'DEBUG') {
        console.log(formattedArg);
      }
    });
  }
};

// Log levels
const debug = (message, ...args) => {
  logMessage(message, args, 'DEBUG');
};

const log = (message, ...args) => {
  logMessage(message, args, 'INFO');
};

const warn = (message, ...args) => {
  logMessage(message, args, 'WARN');
};

const error = (message, ...args) => {
  logMessage(message, args, 'ERROR');
};

const info = log; // Alias for log

export default {
  debug,
  log,
  info,
  error,
  warn,
};
