docker run --rm --net ixopds_default --link db:db -v /root:/backup mongo bash -c 'mongodump --out /backup --host db:27017'