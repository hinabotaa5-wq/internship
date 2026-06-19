FROM public.ecr.aws/docker/library/mysql:8.0.28-oracle

EXPOSE 3306

COPY ./my.cnf /etc/mysql/conf.d/my.cnf
COPY ./init/* /docker-entrypoint-initdb.d/

CMD ["mysqld"]
