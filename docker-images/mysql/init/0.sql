CREATE DATABASE db;
CREATE USER "user"@"%" IDENTIFIED BY "user&pass";
GRANT ALL ON db.* TO "user"@"%";
