db.createUser({user: "%%ROOT%%", pwd: "%%PASSWORD%%", roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]})