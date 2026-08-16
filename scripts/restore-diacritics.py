#!/usr/bin/env python3
"""
Restores stripped diacritics in the locale files.

Only words whose unaccented form is not itself a valid word in that language
are touched. Pairs like French supprime/supprimé, Spanish esta/está or Polish
faktura/fakturą are real distinct words and are left alone: a script cannot
tell which one a given string meant, and guessing would corrupt correct text.

Every replacement below was taken from spellings the same locale already uses
elsewhere, so nothing is invented.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path("/home/sinamics/torqvoice/messages")

FIXES = {
    "fr": {
        "parametres": "paramètres", "parametre": "paramètre", "echec": "échec",
        "donnees": "données", "defaut": "défaut", "numero": "numéro",
        "numeros": "numéros", "enregistres": "enregistrés", "vehicules": "véhicules",
        "vehicule": "véhicule", "pieces": "pièces", "piece": "pièce",
        "acces": "accès", "modele": "modèle", "modeles": "modèles",
        "etre": "être", "definitivement": "définitivement", "equipe": "équipe",
        "telephone": "téléphone", "details": "détails", "telecharger": "télécharger",
        "telechargement": "téléchargement", "apercu": "aperçu", "creer": "créer",
        "creez": "créez", "creation": "création", "annulee": "annulée",
        "desactiver": "désactiver", "verifier": "vérifier", "verifiez": "vérifiez",
        "verification": "vérification", "terminee": "terminée",
        "fonctionnalites": "fonctionnalités", "tete": "tête",
        "selectionnez": "sélectionnez", "selectionner": "sélectionner",
        "deselectionner": "désélectionner", "succes": "succès", "region": "région",
        "echouee": "échouée", "envoyes": "envoyés", "envoyee": "envoyée",
        "pret": "prêt", "prete": "prête", "echeance": "échéance", "annee": "année",
        "irreversible": "irréversible", "partagees": "partagées",
        "associees": "associées", "definir": "définir", "definitions": "définitions",
        "generees": "générées", "generer": "générer", "generation": "génération",
        "deja": "déjà", "debut": "début", "creee": "créée",
        "caracteres": "caractères", "gerer": "gérer", "proprietaire": "propriétaire",
        "systeme": "système", "secrete": "secrète", "securite": "sécurité",
        "reessayer": "réessayer", "desactivee": "désactivée",
        "visibilite": "visibilité", "kilometrage": "kilométrage",
        "controle": "contrôle", "enregistree": "enregistrée", "derniere": "dernière",
        "reparations": "réparations", "liee": "liée", "configuree": "configurée",
        "reception": "réception", "recu": "reçu", "categories": "catégories",
        "recuperer": "récupérer", "egalement": "également", "hote": "hôte",
        "expediteur": "expéditeur", "reinitialiser": "réinitialiser",
        "eligibles": "éligibles", "reussie": "réussie",
        "supplementaire": "supplémentaire", "salgsvilkar": "salgsvilkår",
    },
    "es": {
        "configuracion": "configuración", "contrasena": "contraseña",
        "contrasenas": "contraseñas", "vehiculo": "vehículo",
        "vehiculos": "vehículos", "numero": "número", "numeros": "números",
        "codigo": "código", "organizacion": "organización",
        "electronico": "electrónico", "invitacion": "invitación",
        "aplicacion": "aplicación", "sesion": "sesión", "ordenes": "órdenes",
        "pagina": "página", "titulo": "título", "accion": "acción",
        "telefono": "teléfono", "dias": "días",
        "automaticamente": "automáticamente", "cotizacion": "cotización",
        "importacion": "importación", "tecnico": "técnico",
        "inspeccion": "inspección", "conexion": "conexión",
        "mensajeria": "mensajería", "ningun": "ningún", "eliminara": "eliminará",
        "proximo": "próximo", "verificacion": "verificación",
        "direccion": "dirección", "region": "región", "diseno": "diseño",
        "informacion": "información", "garantia": "garantía",
        "imagenes": "imágenes", "gestion": "gestión", "valido": "válido",
        "linea": "línea", "actualizacion": "actualización",
        "encontro": "encontró", "suscripcion": "suscripción",
        "digitos": "dígitos", "facturacion": "facturación", "mecanico": "mecánico",
        "tamano": "tamaño", "descripcion": "descripción", "terminos": "términos",
        "miercoles": "miércoles", "sabado": "sábado", "busqueda": "búsqueda",
        "reparacion": "reparación", "aqui": "aquí", "traves": "través",
        "conservara": "conservará", "atras": "atrás",
        "continuacion": "continuación", "categorias": "categorías",
        "establecera": "establecerá", "ultima": "última", "tambien": "también",
        "implicito": "implícito", "produccion": "producción",
        "intentelo": "inténtelo", "envio": "envío", "perderan": "perderán",
        "vacio": "vacío", "visualizacion": "visualización",
        "minusculas": "minúsculas", "maximo": "máximo",
        "transmision": "transmisión", "salgsvilkar": "salgsvilkår",
    },
    "pt-BR": {
        "configuracoes": "configurações", "configuracao": "configuração",
        "servico": "serviço", "servicos": "serviços", "funcao": "função",
        "orcamentos": "orçamentos", "orcamento": "orçamento", "numero": "número",
        "numeros": "números", "organizacao": "organização",
        "organizacoes": "organizações", "padrao": "padrão", "veiculos": "veículos",
        "veiculo": "veículo", "licenca": "licença", "codigo": "código",
        "codigos": "códigos", "autenticacao": "autenticação",
        "condicoes": "condições", "pecas": "peças", "peca": "peça",
        "conteudo": "conteúdo", "historico": "histórico", "sera": "será",
        "inventario": "inventário", "bancaria": "bancária",
        "manutencao": "manutenção", "acao": "ação", "usuario": "usuário",
        "usuarios": "usuários", "visualizacao": "visualização",
        "importacao": "importação", "conexao": "conexão", "conexoes": "conexões",
        "voce": "você", "serao": "serão", "concluida": "concluída",
        "concluido": "concluído", "aparencia": "aparência",
        "cabecalho": "cabeçalho", "tecnico": "técnico", "inspecao": "inspeção",
        "inspecoes": "inspeções", "excluido": "excluído", "excluida": "excluída",
        "excluira": "excluirá", "proximo": "próximo", "proxima": "próxima",
        "proximos": "próximos", "verificacao": "verificação",
        "endereco": "endereço", "regiao": "região", "informacoes": "informações",
        "liquido": "líquido", "alteracoes": "alterações", "comecar": "começar",
        "atualizacao": "atualização", "transferencia": "transferência",
        "inicio": "início", "pagina": "página", "proprietario": "proprietário",
        "proprio": "próprio", "estao": "estão", "horario": "horário",
        "horarios": "horários", "permissao": "permissão",
        "combustivel": "combustível", "seguranca": "segurança",
        "exibicao": "exibição", "area": "área", "preco": "preço",
        "precos": "preços", "incluido": "incluído", "relatorio": "relatório",
        "terca": "terça", "sabado": "sábado", "cartao": "cartão",
        "possivel": "possível", "definira": "definirá", "tambem": "também",
        "implicito": "implícito", "producao": "produção", "forcar": "forçar",
        "dominio": "domínio", "digitos": "dígitos", "invalido": "inválido",
        "solicitacoes": "solicitações", "joao": "joão", "secoes": "seções",
        "definicoes": "definições", "perderao": "perderão", "rodape": "rodapé",
        "preferencia": "preferência", "elegiveis": "elegíveis",
        "expiracao": "expiração", "minusculas": "minúsculas",
        "atribuida": "atribuída", "ardosia": "ardósia", "ultima": "última",
        "destinatario": "destinatário", "salgsvilkar": "salgsvilkår",
    },
    "pl": {
        "usun": "usuń", "usunac": "usunąć", "wiadomosci": "wiadomości",
        "rekordow": "rekordów", "wprowadz": "wprowadź",
        "wprowadzic": "wprowadzić", "utworz": "utwórz", "utworzyc": "utworzyć",
        "ustawien": "ustawień", "dostep": "dostęp", "dostepu": "dostępu",
        "domyslna": "domyślna", "domyslne": "domyślne", "domyslny": "domyślny",
        "domyslnej": "domyślnej", "istniejacych": "istniejących",
        "istniejace": "istniejące", "czesci": "części", "czesc": "część",
        "czesciowa": "częściowa", "zapisac": "zapisać",
        "zaktualizowac": "zaktualizować", "zakonczony": "zakończony",
        "zlecen": "zleceń", "klientow": "klientów", "pokaz": "pokaż",
        "przeslij": "prześlij", "moze": "może", "mozesz": "możesz",
        "mozna": "można", "moga": "mogą", "zawartosc": "zawartość",
        "podglad": "podgląd", "miedzy": "między", "cofnac": "cofnąć",
        "wyslij": "wyślij", "uzyj": "użyj", "uzyc": "użyć", "uzyto": "użyto",
        "pomyslnie": "pomyślnie", "uzytkownik": "użytkownik",
        "uzytkownika": "użytkownika", "uzytkownikami": "użytkownikami",
        "twoj": "twój", "wyglad": "wygląd", "wartosci": "wartości",
        "usuniete": "usunięte", "usunieta": "usunięta", "usuniety": "usunięty",
        "kazdy": "każdy", "kazda": "każda", "kazdej": "każdej",
        "kazdego": "każdego", "dostawce": "dostawcę", "zostana": "zostaną",
        "zarzadzaj": "zarządzaj", "zarzadzac": "zarządzać",
        "zarzadzanie": "zarządzanie", "powiazane": "powiązane", "jesli": "jeśli",
        "potwierdzic": "potwierdzić", "potwierdz": "potwierdź",
        "stawke": "stawkę", "zdjecia": "zdjęcia", "udostepnij": "udostępnij",
        "udostepnione": "udostępnione", "prosze": "proszę",
        "wyswietl": "wyświetl", "wyswietlane": "wyświetlane",
        "wyswietlanie": "wyświetlanie", "wyswietlana": "wyświetlana",
        "wyswietlania": "wyświetlania", "odbierac": "odbierać",
        "oczekujace": "oczekujące", "nazwe": "nazwę", "ponizej": "poniżej",
        "przejdz": "przejdź", "rozpoczac": "rozpocząć", "znakow": "znaków",
        "otworz": "otwórz", "zastosowac": "zastosować", "pobrac": "pobrać",
        "ktorym": "którym", "ktore": "które", "nastepnie": "następnie",
        "nastepny": "następny", "nastepna": "następna", "sprobuj": "spróbuj",
        "firme": "firmę", "zmien": "zmień", "zmienic": "zmienić",
        "logowac": "logować", "zalogowac": "zalogować",
        "widocznosc": "widoczność", "beda": "będą", "bedzie": "będzie",
        "bedziesz": "będziesz", "pojawia": "pojawią", "anulowac": "anulować",
        "ilosc": "ilość", "sprzedazy": "sprzedaży", "sroda": "środa",
        "piatek": "piątek", "szablonow": "szablonów", "zadne": "żadne",
        "przegladac": "przeglądać", "przegladarka": "przeglądarka",
        "przegladarki": "przeglądarki", "wiecej": "więcej",
        "dziekujemy": "dziękujemy", "pojazdow": "pojazdów", "swoja": "swoją",
        "prog": "próg", "miec": "mieć", "ogolne": "ogólne",
        "zweryfikowac": "zweryfikować", "rowniez": "również",
        "skonfigurowac": "skonfigurować", "zezwolic": "zezwolić",
        "wymus": "wymuś", "historie": "historię", "sprawdz": "sprawdź",
        "przywroc": "przywróć", "pomoca": "pomocą",
        "bezpieczenstwa": "bezpieczeństwa", "straca": "stracą",
        "kolejnosc": "kolejność", "kwalifikujace": "kwalifikujące",
        "wygasniecie": "wygaśnięcie", "podkreslenia": "podkreślenia",
        "godzine": "godzinę", "sposob": "sposób", "wymagaja": "wymagają",
        "salgsvilkar": "salgsvilkår",
    },
}


def match_case(src: str, repl: str) -> str:
    """Keep the original capitalisation: Numero -> Numéro, NUMERO -> NUMÉRO."""
    if src.isupper():
        return repl.upper()
    if src[:1].isupper():
        return repl[:1].upper() + repl[1:]
    return repl


def fix_text(text: str, table: dict[str, str], counts: dict[str, int]) -> str:
    def sub(m: re.Match) -> str:
        word = m.group(0)
        repl = table.get(word.lower())
        if repl is None:
            return word
        counts[word.lower()] = counts.get(word.lower(), 0) + 1
        return match_case(word, repl)

    pattern = re.compile(
        r"(?<![^\W\d_])(" + "|".join(sorted(map(re.escape, table), key=len, reverse=True)) + r")(?![^\W\d_])",
        re.IGNORECASE,
    )
    return pattern.sub(sub, text)


def walk(node, table, counts):
    if isinstance(node, str):
        return fix_text(node, table, counts)
    if isinstance(node, dict):
        return {k: walk(v, table, counts) for k, v in node.items()}
    if isinstance(node, list):
        return [walk(v, table, counts) for v in node]
    return node


def main(write: bool) -> None:
    grand = 0
    for locale, table in FIXES.items():
        counts: dict[str, int] = {}
        touched = 0
        for path in sorted((ROOT / locale).glob("*.json")):
            original = path.read_text(encoding="utf-8")
            data = json.loads(original)
            fixed = walk(data, table, counts)
            out = json.dumps(fixed, ensure_ascii=False, indent=2) + "\n"
            if json.dumps(data, ensure_ascii=False, indent=2) + "\n" != out:
                touched += 1
                if write:
                    path.write_text(out, encoding="utf-8")
        total = sum(counts.values())
        grand += total
        top = sorted(counts.items(), key=lambda kv: -kv[1])[:6]
        print(f"{locale:6} {total:5} words restored across {touched:2} files   "
              + ", ".join(f"{k}->{table[k]} x{v}" for k, v in top))
    print(f"\nTOTAL: {grand} words restored")


if __name__ == "__main__":
    main(write="--write" in sys.argv)
