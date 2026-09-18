from adscope_api.urls import build


# Fait rougir `site_id.isdigit() and len(site_id) >= 6` dans `urls._lbc`.
def test_lbc_url_from_a_numeric_id():
    assert build("lbc", "3263259495") == "https://www.leboncoin.fr/ad/voitures/3263259495"


def test_lbc_refuses_a_reference_without_the_right_shape():
    assert build("lbc", "abc") is None


# Fait rougir `ord(site_id[0])` dans `urls._lacentrale` : la lettre de tête
# devient son code ASCII, W → 87, comme `extension/src/sites/lacentrale.js`
# le fait côté page.
def test_lacentrale_url_replaces_the_leading_letter_by_its_code():
    assert build("lc", "W103538172") == (
        "https://www.lacentrale.fr/auto-occasion-annonce-87103538172.html"
    )


def test_lacentrale_with_a_different_leading_letter():
    assert build("lc", "E119119489") == (
        "https://www.lacentrale.fr/auto-occasion-annonce-69119119489.html"
    )


def test_lacentrale_refuses_a_reference_without_a_leading_letter():
    assert build("lc", "103538172") is None


def test_an_unknown_site_has_no_address():
    assert build("olx", "1") is None
