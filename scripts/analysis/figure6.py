"""Recompute descriptive Figure 6 panels from the verified final database.

Panel A pools dinucleotide steps and describes composition, not enrichment or
independent predictor validation. Panels B–D use species-level taxids. No
phylogenetic correction is claimed. The optional step cache is an explicit input
and must have been computed from the same database.
"""
import argparse
import json
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from scipy.stats import spearmanr


PAIRS = {'gc': ['GC', 'CG'], 'gt': ['GT', 'TG'], 'ac': ['AC', 'CA'], 'at': ['AT', 'TA']}


def steps_query(table='data'):
    # Each dinucleotide here has two different bases, so occurrence counting
    # with replace also counts all overlapping dinucleotide positions correctly.
    parts = ['assembly', 'SUM(greatest(length(seq)-1,0))::BIGINT AS steps']
    for label, pairs in PAIRS.items():
        expression = ' + '.join(f"(length(seq)-length(replace(seq,'{pair}','')))/2" for pair in pairs)
        parts.append(f'SUM({expression})::BIGINT AS {label}')
    return 'SELECT ' + ','.join(parts) + f' FROM (SELECT assembly,upper("Sequence") seq FROM {table}) s GROUP BY assembly'


def correlation(frame):
    values = frame[['gc', 'density']].dropna()
    if len(values) < 3 or values.gc.nunique() < 2 or values.density.nunique() < 2:
        return dict(n=len(values), rho=None, p=None)
    result = spearmanr(values.gc, values.density)
    return dict(n=len(values), rho=float(result.statistic),
                p='<0.001' if result.pvalue < .001 else float(result.pvalue))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database'); parser.add_argument('output')
    parser.add_argument('--steps', help='Existing per-assembly step-count Parquet from the same database')
    parser.add_argument('--threads', type=int, default=4)
    args = parser.parse_args()
    out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(args.database, read_only=True)
    con.execute(f'SET threads={args.threads}')
    con.execute("SET memory_limit='20GB'")
    print('Collapsing assembly attributes to species taxids', flush=True)
    species = con.execute('''SELECT species_taxid, AVG(gc_percent) gc,
      AVG(obs_density_per_kb) density, AVG(genome_size) genome_size,
      COUNT(*) assemblies FROM metadata_all
      WHERE species_taxid IS NOT NULL AND species_taxid>0 GROUP BY species_taxid''').df()
    grouped = con.execute('''SELECT superkingdom,species_taxid,AVG(gc_percent) gc,
      AVG(obs_density_per_kb) density FROM metadata_all
      WHERE species_taxid IS NOT NULL AND species_taxid>0
      GROUP BY superkingdom,species_taxid''').df()
    species.to_csv(out/'figure6_species.csv', index=False)
    grouped.to_csv(out/'figure6_species_by_superkingdom.csv', index=False)
    stats = {'overall': correlation(species)}
    for name, group in grouped.groupby('superkingdom'):
        stats[name] = correlation(group)
    density_summary = grouped.groupby('superkingdom').density.agg(
        n='count', mean='mean', sem='sem', median='median',
        q1=lambda s: s.quantile(.25), q3=lambda s: s.quantile(.75))
    density_summary.to_csv(out/'figure6_density_summary.csv')
    steps_path = Path(args.steps) if args.steps else out/'figure6_steps_by_assembly.parquet'
    if not args.steps:
        print('Counting dinucleotide steps across all actual prediction sequences (full scan)', flush=True)
        path = str(steps_path.resolve()).replace("'", "''")
        con.execute(f"COPY ({steps_query()}) TO '{path}' (FORMAT PARQUET)")
    step_counts = con.execute(
        'SELECT * FROM read_parquet(?)', [str(steps_path)]).df()
    totals = step_counts[['steps', *PAIRS]].sum()
    other = int(totals['steps']-sum(totals[label] for label in PAIRS))
    composition = pd.DataFrame({'class': ['GC/CG','GT/TG','AC/CA','AT/TA','Other'],
        'steps': [int(totals[label]) for label in PAIRS]+[other]})
    composition['fraction'] = composition.steps / totals['steps']
    composition.to_csv(out/'figure6_composition.csv', index=False)
    joined = step_counts.merge(con.execute('SELECT assembly,species_taxid FROM metadata_all').df(), on='assembly', validate='one_to_one')
    for label in ['gc','gt']:
        joined[label+'_fraction'] = joined[label] / joined.steps.replace(0,np.nan)
    fractions = joined.groupby('species_taxid')[['gc_fraction','gt_fraction']].mean().reset_index()
    fractions = fractions.merge(species[['species_taxid','gc']], on='species_taxid', validate='one_to_one').dropna()
    fractions['gc_bin'] = np.minimum(np.floor(fractions.gc / 5)*5,95)
    fractions.to_csv(out/'figure6_species_composition.csv', index=False)
    binned = fractions.groupby('gc_bin').agg(gc_fraction=('gc_fraction','mean'),gt_fraction=('gt_fraction','mean'),n=('species_taxid','count'))
    binned.to_csv(out/'figure6_composition_bins.csv')
    summary = dict(assemblies=int(con.execute('SELECT COUNT(*) FROM metadata_all').fetchone()[0]),
        predictions=int(con.execute('SELECT COUNT(*) FROM data').fetchone()[0]),
        species_taxids=len(species), mean_genome_size=float(species.genome_size.mean()),
        mean_gc=float(species.gc.mean()), canonical_step_fraction=float((totals['gc']+totals['gt']+totals['ac'])/totals['steps']),
        correlations=stats, unit='species-level NCBI taxid', descriptive=True,
        composition_binning='Assembly step fractions averaged within species, then across species in 5-percentage-point bins of species-mean genomic GC; assemblies with no loci have undefined step fractions and are omitted from composition averages.')
    (out/'figure6_summary.json').write_text(json.dumps(summary,indent=2)+'\n')

    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.size':15,'pdf.fonttype':42})
    fig, axes = plt.subplots(2,2,figsize=(12,9),constrained_layout=True)
    ax=axes[0,0]; ax.bar(composition['class'],composition.fraction*100,color=['#4e79a7','#f28e2b','#59a14f','#76b7b2','#bab0ac'])
    ax.set(ylabel='Dinucleotide steps (%)',title='A. Composition within predicted loci')
    points=species[['gc','density']].dropna()
    ax=axes[0,1]; h=ax.hexbin(points.gc,points.density,gridsize=45,bins='log',mincnt=1,cmap='viridis')
    fig.colorbar(h,ax=ax,label='Species taxids (log color scale)')
    ax.set(xlabel='Species-mean genomic GC (%)',ylabel='Predicted bp / kb',title='B. Species-balanced association')
    ax.text(.03,.97,f"Spearman ρ = {stats['overall']['rho']:.3f}\nn = {stats['overall']['n']:,} species taxids",transform=ax.transAxes,va='top')
    ax=axes[1,0]
    for label,color in [('gc','#4e79a7'),('gt','#f28e2b')]:
        ax.plot(binned.index+2.5,binned[label+'_fraction'],marker='o',label='/'.join(PAIRS[label]),color=color)
    ax.set(xlabel='Species-mean genomic GC (5% bins)',ylabel='Mean fraction of dinucleotide steps',title='C. Species-balanced composition');ax.legend()
    order=[name for name in ['Archaea','Bacteria','Eukaryota','Viruses'] if name in density_summary.index]
    ds=density_summary.loc[order]
    ax=axes[1,1];ax.bar(order,ds['mean'],yerr=ds['sem'],capsize=4,color=['#4e79a7','#f28e2b','#e15759','#76b7b2'][:len(order)])
    ax.set(ylabel='Mean predicted bp / kb (± SEM)',title='D. Species-balanced density')
    for suffix in ['pdf','png']:fig.savefig(out/f'figure6_recomputed.{suffix}',dpi=300)
    plt.close(fig)
    fig,ax=plt.subplots(figsize=(8,5),constrained_layout=True)
    distributions=[grouped.loc[grouped.superkingdom==name,'density'].dropna().to_numpy() for name in order]
    ax.violinplot(distributions,showmedians=True,quantiles=[[.25,.75]]*len(order))
    ax.set_xticks(range(1,len(order)+1),order);ax.set(ylabel='Species-mean predicted bp / kb',title='Descriptive density distributions')
    for suffix in ['pdf','png']:fig.savefig(out/f'figure6_density_distributions.{suffix}',dpi=300)
    plt.close(fig)
    print(json.dumps(summary,indent=2),flush=True)


if __name__ == '__main__':
    main()
