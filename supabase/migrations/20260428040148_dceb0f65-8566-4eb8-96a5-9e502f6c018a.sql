DELETE FROM cash_transactions WHERE notes LIKE '%fcdfc091-57c3-49f6-bf52-6ac9548afa2e%';
UPDATE orders SET payment_method='card_credit', notes=NULL WHERE id='fcdfc091-57c3-49f6-bf52-6ac9548afa2e';