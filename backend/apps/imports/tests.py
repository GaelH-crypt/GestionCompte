import io
import datetime
import openpyxl
from django.test import TestCase
from apps.imports.services.parser import parse_excel


def _make_excel():
    wb = openpyxl.Workbook()

    # Feuille "Vos comptes"
    ws = wb.active
    ws.title = 'Vos comptes'
    ws.append([None])
    ws.append(['Compte', 'R.I.B.', 'Solde', 'Dev'])
    ws.append(['C/C EUROCOMPTE CONFORT', '10278 02625 00022060507', 156.22, 'EUR'])
    ws.append(['LIVRET BLEU', '10278 02625 00023120602', 10.0, 'EUR'])

    # Feuille compte courant
    wc = wb.create_sheet('Cpt 02625 00022060507')
    wc.append(['R.I.B. : 10278 02625 00022060507'] + [None] * 6)
    wc.append([None, None, None, 'Solde initial :', 'Solde initial :', None, 'EUR'])
    wc.append(['Liste de vos comptes'] * 6 + [None])
    wc.append(['Date', 'Valeur', 'Libellé', 'Débit', 'Crédit', 'Solde', 'Dev'])
    wc.append([datetime.datetime(2026, 5, 1), datetime.datetime(2026, 5, 1), 'CARREFOUR MARKET', -42.5, None, None, 'EUR'])
    wc.append([datetime.datetime(2026, 5, 2), datetime.datetime(2026, 5, 2), 'SALAIRE MAI', None, 2500.0, None, 'EUR'])
    wc.append([None, None, None, 'Solde au 28/05/2026 :', 'Solde au 28/05/2026 :', 156.22, 'EUR'])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


class ParserTest(TestCase):
    def setUp(self):
        self.file = _make_excel()

    def test_accounts_extracted(self):
        result = parse_excel(self.file)
        self.assertEqual(len(result['accounts']), 2)
        acc = result['accounts'][0]
        self.assertEqual(acc['name'], 'C/C EUROCOMPTE CONFORT')
        self.assertEqual(acc['rib'], '10278 02625 00022060507')
        self.assertAlmostEqual(float(acc['balance']), 156.22)

    def test_transactions_extracted(self):
        result = parse_excel(self.file)
        txs = result['transactions']['10278 02625 00022060507']
        self.assertEqual(len(txs), 2)

    def test_debit_transaction(self):
        result = parse_excel(self.file)
        txs = result['transactions']['10278 02625 00022060507']
        debit = next(t for t in txs if t['transaction_type'] == 'expense')
        self.assertEqual(debit['description'], 'CARREFOUR MARKET')
        self.assertAlmostEqual(float(debit['amount']), 42.5)
        self.assertEqual(debit['date'], '2026-05-01')

    def test_credit_transaction(self):
        result = parse_excel(self.file)
        txs = result['transactions']['10278 02625 00022060507']
        credit = next(t for t in txs if t['transaction_type'] == 'income')
        self.assertAlmostEqual(float(credit['amount']), 2500.0)

    def test_footer_rows_skipped(self):
        result = parse_excel(self.file)
        txs = result['transactions']['10278 02625 00022060507']
        # La ligne "Solde au ..." ne doit pas apparaître
        self.assertFalse(any('Solde au' in t['description'] for t in txs))

    def test_rib_consistency(self):
        result = parse_excel(self.file)
        account_ribs = {a['rib'] for a in result['accounts']}
        transaction_ribs = set(result['transactions'].keys())
        # All transaction RIBs must correspond to an account RIB
        self.assertTrue(transaction_ribs.issubset(account_ribs))
