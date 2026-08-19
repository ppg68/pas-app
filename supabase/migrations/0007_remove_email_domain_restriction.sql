-- PAS — rimuove la restrizione di dominio email sulla creazione account.
--
-- PAS deve poter includere anche persone esterne a Oikos (consulenti, membri di
-- organizzazioni partner) come firmatari occasionali. La vera barriera di accesso
-- resta il ruolo in `user_roles`: chi si registra senza un ruolo assegnato da un
-- RAC/CAR non può firmare né creare nulla — lo bloccano comunque le policy RLS e i
-- controlli nelle server action (vedi lib/domain/workflow.ts). Il filtro di dominio
-- era quindi solo un secondo cancello ridondante, non la protezione reale.
drop trigger if exists trg_restrict_email_domain on auth.users;
drop function if exists restrict_email_domain();
